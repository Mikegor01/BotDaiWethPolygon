require("dotenv").config();
const { ethers } = require("hardhat");
const UNISWAP = require("@uniswap/sdk");

const { POLYGON_URL } = process.env;

provider = new ethers.providers.WebSocketProvider(POLYGON_URL);

//addresses
const UV2Router_ADDR = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const UFactory_ADDR = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";
const SFactory_ADDR = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";
const SRouter_ADDR = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

//Get uniswap abis Also used for sushiswap
const IUniswapV2Router02 = require("@uniswap/v2-periphery/build/IUniswapV2Router02.json");
const IUniswapV2Factory = require("@uniswap/v2-core/build/IUniswapV2Factory.json");
const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json");
const IERC20 = require("@uniswap/v2-core/build/IERC20.json");
const { BigNumber } = require("ethers");

//Create contract and Token instances
async function getTokenAndContract(_token0Address, _token1Address) {
  const token0Contract = new ethers.Contract(
    _token0Address,
    IERC20.abi,
    provider
  );
  const token1Contract = new ethers.Contract(
    _token1Address,
    IERC20.abi,
    provider
  );

  const token0 = new UNISWAP.Token(
    137,
    _token0Address,
    await token0Contract.decimals(),
    await token0Contract.symbol(),
    await token0Contract.name()
  );

  const token1 = new UNISWAP.Token(
    137,
    _token1Address,
    await token1Contract.decimals(),
    await token1Contract.symbol(),
    await token1Contract.name()
  );

  return { token0Contract, token1Contract, token0, token1 };
}

//Create some functions
async function getPairAddress(_Factory, _token0, _token1) {
  const pairAddress = await _Factory.getPair(_token0, _token1);
  return pairAddress;
}

async function getPairContract(_Factory, _token0, _token1) {
  const pairAddress = await getPairAddress(_Factory, _token0, _token1);
  const pairContract = new ethers.Contract(
    pairAddress,
    IUniswapV2Pair.abi,
    provider
  );
  return pairContract;
}

async function getReserves(_pairContract) {
  const reserves = await _pairContract.getReserves();
  return [reserves.reserve0, reserves.reserve1];
}

async function calculatePrice(_pairContract) {
  const [reserve0, reserve1] = await _pairContract.getReserves();
  return BigNumber(reserve1).div(BigNumber(reserve0)).toString();
}

async function getEstReturn(amount, _routerPath, _token0, _token1) {
  const trade1 = await _routerPath[0].getAmountsOut(amount, [
    _token0.address,
    _token1.address,
  ]);
  const trade2 = await _routerPath[1].getAmountsOut(trade1[1], [
    _token1.address,
    _token0.address,
  ]);

  const amountIn = Number(ethers.utils.formatEther(trade1[0], "ether"));
  const amountOut = Number(ethers.utils.formatEther(trade2[1], "ether"));

  return { amountIn, amountOut };
}

//Create contract instances
const uFactory = new ethers.Contract(
  UFactory_ADDR,
  IUniswapV2Factory.abi,
  provider
);
const uRouter = new ethers.Contract(
  UV2Router_ADDR,
  IUniswapV2Router02.abi,
  provider
);
const sFactory = new ethers.Contract(
  SFactory_ADDR,
  IUniswapV2Factory.abi,
  provider
);
const sRouter = new ethers.Contract(
  SRouter_ADDR,
  IUniswapV2Router02.abi,
  provider
);

module.exports = {
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
};
