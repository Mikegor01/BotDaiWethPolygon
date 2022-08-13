require("dotenv").config();

const { ethers } = require("hardhat");
const {
  getTokenAndContract,
  getPairAddress,
  getPairContract,
  getReserves,
  calculatePrice,
  getEstReturn,
  uFactory,
  uRouter,
  sFactory,
  sRouter,
  provider,
} = require("./helpers/helpers");
const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json");
const contractJSON = require("../artifacts/contracts/UniswapFlashSwap.sol/UniswapFlashSwap.json");
const abi = contractJSON.abi;

const {
  PRIVATE_KEY,
  MATIC_ADDR,
  MATIC_KEY,
  DIFF_THRESHOLD,
  GAS_LIMIT,
  GAS_PRICE,
} = process.env;

const alchemy = new ethers.providers.AlchemyProvider("matic", MATIC_KEY);

const wallet = new ethers.Wallet(PRIVATE_KEY, alchemy);

//Token addresses
const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
const DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const diffTarget = DIFF_THRESHOLD;

let unipairContract, suspairContract;
let reserves;
let isExecuting = false;

const UniswapFlashSwap = new ethers.Contract(MATIC_ADDR, abi, wallet);

async function main() {
  const { token0Contract, token1Contract, token0, token1 } =
    await getTokenAndContract(WETH, DAI);

  unipairContract = await getPairContract(
    uFactory,
    token0.address,
    token1.address
  );

  suspairContract = await getPairContract(
    sFactory,
    token0.address,
    token1.address
  );

  // Wait for swap event in your DEX
  unipairContract.on("Swap", async () => {
    if (!isExecuting) {
      isExecuting = true;

      const priceDiff = await checkPrice("Uniswap", token0, token1);
      const routerPath = await determineDirection(priceDiff);

      //The routerPath is an array of the 2 token addresses. This checks to ensure the addresses are valid
      if (!routerPath) {
        console.log(`No arbitrage Available\n`);
        isExecuting = false;
        return;
      }

      const isProfitable = await determineProfitability(
        routerPath,
        token0Contract,
        token0,
        token1
      );

      // if (!isProfitable) {
      //   console.log(`No arbitrage currently Available\n`);
      //   isExecuting = false;
      //   return;
      // }

      const receipt = await executeTrade(
        routerPath,
        token0Contract,
        token1Contract
      );

      isExecuting = false;
    }
  });

  suspairContract.on("Swap", async () => {
    if (!isExecuting) {
      isExecuting = true;

      const priceDiff = await checkPrice("Sushiswap", token0, token1);
      const routerPath = await determineDirection(priceDiff);

      if (!routerPath) {
        console.log(`No arbitrage Available\n`);
        isExecuting = false;
        return;
      }

      const isProfitable = await determineProfitability(
        routerPath,
        token0Contract,
        token0,
        token1
      );

      // if (!isProfitable) {
      //   console.log(`No arbitrage currently Available\n`);
      //   isExecuting = false;
      //   return;
      // }

      const receipt = await executeTrade(
        routerPath,
        token0Contract,
        token1Contract
      );

      isExecuting = false;
    }
  });

  console.log("Waiting for a swap event!");
}

const checkPrice = async (exchange, token0, token1) => {
  isExecuting = true;

  console.log(`Swap initiated on ${exchange}, Checking Price ...\n`);

  const currentBlock = await provider.getBlockNumber();

  const uniPrice = await priceCalc(unipairContract);
  const susPrice = await priceCalc(suspairContract);
  const priceDiff = (((uniPrice - susPrice) / susPrice) * 100).toFixed(2);

  console.log(`Current Block: ${currentBlock}`);
  console.log(`-------------------------------`);
  console.log(`UNISWAP | ${token0.symbol}/${token1.symbol}\t | ${uniPrice}`);
  console.log(`SUSHISWAP | ${token0.symbol}/${token1.symbol}\t | ${susPrice}`);
  console.log(`Percentage Difference: ${priceDiff}%\n`);

  return priceDiff;
};

async function priceCalc(pairContract) {
  const [reserve0, reserve1] = await pairContract.getReserves();
  const price = (reserve1 / reserve0).toString();
  return price;
}

const determineDirection = async (priceDiff) => {
  console.log(`Determining direction...\n`);
  if (priceDiff >= diffTarget) {
    console.log(`Buy\t-->\t Uniswap`);
    console.log(`Sell\t--> \tSushiswap\n`);
    return [uRouter, sRouter];
  } else if (priceDiff <= -diffTarget) {
    console.log(`Buy\t-->\t Sushiswap`);
    console.log(`Sell\t-->\t Uniswap\n`);
    return [sRouter, uRouter];
  } else {
    return null;
  }
};

const determineProfitability = async (
  _routerPath,
  _token0Contract,
  _token0,
  _token1
) => {
  console.log(`Calculating Profitability..\n`);

  let reserves, exchangeToBuy, exchangeToSell;

  //If routerPath is Uniswap first getReserves from Sushiswap getReserves returns an array reserves[0], reserves[1]
  if (_routerPath[0].address == uRouter.address) {
    reserves = await getReserves(suspairContract);
    exchangeToBuy = "Uniswap";
    exchangeToSell = "Sushiswap";
  } else {
    reserves = await getReserves(unipairContract);
    exchangeToBuy = "Sushiswap";
    exchangeToSell = "Uniswap";
  }
  //Get the amount of tokens on the exchange where they will be sold and the amount of WETH
  console.log(`Reserves on ${_routerPath[1].address}`);
  console.log(
    `DAI: ${ethers.utils.formatEther(reserves[1].toString(), "ether")}\n`
  );

  console.log(
    `WETH: ${Number(
      ethers.utils.formatEther(reserves[0].toString(), "ether")
    ).toFixed(2)}`
  );

  //The first part determines how much WETH will be needed to move the price via AMM constant product formula
  //The second part calculates how much WETH is returned based on the amountsIn from the first part
  //This is used to calculate the optimal token amounts before calling the swap and determining profitability
  try {
    let result = await _routerPath[0].getAmountsIn(reserves[0], [
      _token0.address,
      _token1.address,
    ]);

    const token0In = result[0];
    const token1In = result[1];

    console.log(token0In);

    result = await _routerPath[1].getAmountsOut(token1In, [
      _token1.address,
      _token0.address,
    ]);

    console.log(
      `Est amount of WETH needed on exchange to buy DAI ${exchangeToBuy}\t\t| ${ethers.utils.formatEther(
        token0In,
        "ether"
      )}`
    );
    console.log(
      `Est amount of WETH returned after swap for DAI on ${exchangeToSell}\t\t| ${ethers.utils.formatEther(
        result[1],
        "ether"
      )}\n`
    );

    const { amountIn, amountOut } = await getEstReturn(
      token0In,
      _routerPath,
      _token0,
      _token1
    );

    const amountDiff = amountOut - amountIn;
    console.log(amountDiff);

    amount = token0In;

    console.log(amount);
    return true;
  } catch (error) {
    console.log(error);
  }
};

const executeTrade = async (_routerPath, _token0Contract, _token1Contract) => {
  console.log(`Attempting the arbitrage..\n`);

  try {
    let StartOnUniswap;

    if (_routerPath[0]._address == uRouter._address) {
      StartOnUniswap = true;
    } else {
      StartOnUniswap = false;
    }

    const tx = await UniswapFlashSwap.testFlashSwap(
      WETH,
      amount,
      StartOnUniswap,
      {
        gasLimit: GAS_LIMIT,
        gasPrice: GAS_PRICE,
      }
    );
    const txReceipt = await tx.wait();

    console.log("Success. Transaction completed");
    console.log(txReceipt);
  } catch (error) {
    console.log(error);
    main();
  }
};

main();
// .then(() => process.exit(0))
// .catch((error) => {
//   console.error(error);
//   process.exit(1);
// });
