require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

const { POLYGON_DEPLOY_URL, MUMBAI_DEPLOY_URL, PRIVATE_KEY } = process.env;

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      { version: "0.5.5" },
      { version: "0.6.6" },
      { version: "0.8.8" },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://polygon-mainnet.g.alchemy.com/v2/SgF44e858Wdvwc7-7pM8oNSnboA5aOjg",
      },
      gas: 2000000,
    },
    testnet: {
      url: MUMBAI_DEPLOY_URL,
      accounts: [PRIVATE_KEY],
    },
    mainnet: {
      url: POLYGON_DEPLOY_URL,
      chainId: 137,
      accounts: [PRIVATE_KEY],
    },
  },
};
