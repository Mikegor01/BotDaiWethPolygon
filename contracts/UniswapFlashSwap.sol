//SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IERC20.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IUniswapV2Factory.sol";

interface IUniswapV2Callee {
    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}

contract UniswapFlashSwap is IUniswapV2Callee, Ownable {
    //Factory and Routing addresses
    address private constant UNISWAP_FACTORY =
        0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32;
    address private constant UNISWAP_ROUTER =
        0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff;
    address private constant SUSHI_FACTORY =
        0xc35DADB65012eC5796536bD9864eD8773aBc74C4;
    address private constant SUSHI_ROUTER =
        0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;

    //Token addresses
    address private constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address private constant DAI = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
    address private constant WMATIC =
        0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    //Trade variables
    uint256 private deadline = block.timestamp + 1 days;
    uint256 private constant MAX_INT =
        115792089237316195423570985008687907853269984665640564039457584007913129639935;

    //Get contract balance
    function getBalanceOfToken(address _address) public view returns (uint256) {
        return IERC20(_address).balanceOf(address(this));
    }

    //Check Profitability
    function checkProfitability(uint256 _input, uint256 _output)
        private
        pure
        returns (bool)
    {
        return _output > _input;
    }

    function testFlashSwap(
        address _tokenBorrow,
        uint256 _amount,
        bool _startOnUniswap
    ) external onlyOwner {
        address tokenOther = _tokenBorrow == WETH ? WMATIC : WETH;
        IERC20(WETH).approve(address(UNISWAP_ROUTER), MAX_INT);
        IERC20(WMATIC).approve(address(UNISWAP_ROUTER), MAX_INT);
        address pair = IUniswapV2Factory(UNISWAP_FACTORY).getPair(
            _tokenBorrow,
            tokenOther
        );
        require(pair != address(0), "!pair");

        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint256 amount0Out = _tokenBorrow == token0 ? _amount : 0;
        uint256 amount1Out = _tokenBorrow == token1 ? _amount : 0;

        // pass some data to indicate this is a flashswap as opposed to a regular swap
        bytes memory data = abi.encode(_tokenBorrow, _amount, _startOnUniswap);

        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);
    }

    function uniswapV2Call(
        address _sender,
        uint256 _amount0,
        uint256 _amount1,
        bytes calldata _data
    ) external override {
        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        address pair = IUniswapV2Factory(UNISWAP_FACTORY).getPair(
            token0,
            token1
        );
        require(msg.sender == pair, "!pair");
        require(_sender == address(this), "!sender");

        (address _tokenBorrow, uint256 amount, bool _startOnUniswap) = abi
            .decode(_data, (address, uint256, bool));

        // Flash swap fee
        uint256 fee = ((amount * 3) / 997) + 1;
        uint256 amountToRepay = amount + fee;

        //Carry out arb trades here.

        uint256 loanAmount = _amount0 > 0 ? _amount0 : _amount1;

        address tokenQuote = DAI;

        address[] memory path = new address[](2);
        path[0] = _tokenBorrow;
        path[1] = tokenQuote;

        if (_startOnUniswap) {
            _swapOnUniswap(path, loanAmount, 0);

            path[0] = tokenQuote;
            path[1] = _tokenBorrow;

            _swapOnSushiswap(
                path,
                IERC20(tokenQuote).balanceOf(address(this)),
                0
            );
        } else {
            _swapOnSushiswap(path, loanAmount, 0);

            path[0] = tokenQuote;
            path[1] = _tokenBorrow;

            _swapOnUniswap(
                path,
                IERC20(tokenQuote).balanceOf(address(this)),
                0
            );
        }

        uint256 amountWETH = IERC20(_tokenBorrow).balanceOf(address(this));

        bool profCheck = checkProfitability(amountToRepay, amountWETH);
        require(profCheck, "Arbitrage not profitable!");

        IERC20(_tokenBorrow).transfer(
            owner(),
            IERC20(_tokenBorrow).balanceOf(address(this)) - amountToRepay
        );

        IERC20(_tokenBorrow).transfer(pair, amountToRepay);
    }

    //Internal Functions //

    function _swapOnUniswap(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _amountOut
    ) internal {
        require(
            IERC20(_path[0]).approve(address(UNISWAP_ROUTER), _amountIn),
            "Uniswap approval failed"
        );

        IUniswapV2Router02(UNISWAP_ROUTER).swapExactTokensForTokens(
            _amountIn,
            _amountOut,
            _path,
            address(this),
            deadline
        );
    }

    function _swapOnSushiswap(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _amountOut
    ) internal {
        require(
            IERC20(_path[0]).approve(address(SUSHI_ROUTER), _amountIn),
            "Sushiswap approval failed"
        );

        IUniswapV2Router02(SUSHI_ROUTER).swapExactTokensForTokens(
            _amountIn,
            _amountOut,
            _path,
            address(this),
            deadline
        );
    }
}
