const { expect, assert } = require("chai");
const { ethers, waffle } = require("hardhat");
const { impersonateFund } = require("../utilities/utilities");

const {
  abi,
} = require("../artifacts/contracts/interfaces/IERC20.sol/IERC20.json");

const provider = waffle.provider;

describe("Flash loan contract", () => {
  let UNISWAPFLASHSWAP,
    BORROW_AMOUNT,
    StartOnUniswap,
    FUND_AMOUNT,
    initialFundingHuman;

  const decimals = 18;

  const WETH_WHALE = "0xd9952dc091e7cf5ec199c431c69cec8573710333";
  const WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
  const DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
  const gas = 300000;

  const BASE_TOKEN = WETH;

  const tokenBase = new ethers.Contract(BASE_TOKEN, abi, provider);

  beforeEach(async () => {
    //Get owner as signer
    [owner] = await ethers.getSigners();

    //Ensure whale has a balance
    const whale_bal = await provider.getBalance(WETH_WHALE);
    expect(whale_bal).not.equal("0");

    //Deploy smart contract
    const UniswapFlashSwap = await ethers.getContractFactory(
      "UniswapFlashSwap"
    );
    UNISWAPFLASHSWAP = await UniswapFlashSwap.deploy();
    await UNISWAPFLASHSWAP.deployed();

    //Configure borrowing amount
    const borrowAmountHuman = "1";
    BORROW_AMOUNT = ethers.utils.parseUnits(borrowAmountHuman, decimals);

    //Configure starting defi pool
    StartOnUniswap = false;

    //Configure funding for testing only
    initialFundingHuman = "0";
    FUND_AMOUNT = ethers.utils.parseUnits(initialFundingHuman, decimals);

    //Fund the contract - TESTING ONLY
    await impersonateFund(
      tokenBase,
      WETH_WHALE,
      UNISWAPFLASHSWAP.address,
      initialFundingHuman,
      decimals
    );
  });

  describe("Contract is funded", () => {
    it("ensures contract is funded", async () => {
      const uniswapflashbalance = await UNISWAPFLASHSWAP.getBalanceOfToken(
        BASE_TOKEN
      );
      const uniswapflashbalanceHuman = ethers.utils.formatUnits(
        uniswapflashbalance,
        decimals
      );

      expect(Number(uniswapflashbalanceHuman)).equal(
        Number(initialFundingHuman)
      );

      const owner_bal = await provider.getBalance(owner.address);
      const formatOwnerBal = Number(
        ethers.utils.formatUnits(owner_bal, decimals)
      );
      console.log(formatOwnerBal);
    });

    it("executes the flash loan", async () => {
      txFlashLoan = await UNISWAPFLASHSWAP.testFlashSwap(
        BASE_TOKEN,
        BORROW_AMOUNT,
        StartOnUniswap
      );
      assert(txFlashLoan);

      //Print Balances
      const contractBalWETH = await UNISWAPFLASHSWAP.getBalanceOfToken(WETH);
      const formatBALWETH = Number(
        ethers.utils.formatUnits(contractBalWETH, decimals)
      );

      const contractBalDAI = await UNISWAPFLASHSWAP.getBalanceOfToken(DAI);
      const formatBALDAI = Number(
        ethers.utils.formatUnits(contractBalDAI, decimals)
      );

      // const owner_bal = await provider.getBalance(owner.address);
      // const formatOwnerBal = Number(
      //   ethers.utils.formatUnits(owner_bal, decimals)
      // );
      // expect(owner_bal).not.equal("0");

      // console.log("Owner Bal of WETH " + formatOwnerBal);

      console.log("Balance of WETH: " + formatBALWETH);
      console.log("Balance of DAI: " + formatBALDAI);
    });
    it("provides GAS output", async () => {
      const txReceipt = await provider.getTransactionReceipt(txFlashLoan.hash);
      const effGasPrice = txReceipt.effectiveGasPrice;
      const txGasUsed = txReceipt.gasUsed;
      const gasUsedMATIC = effGasPrice * txGasUsed;
      console.log(
        "Total Gas USD: " +
          ethers.utils.formatEther(gasUsedMATIC.toString()) * 1600
      );
      expect(gasUsedMATIC).not.equal(0);
    });
  });
});
