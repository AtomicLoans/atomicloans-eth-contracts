var HDWalletProvider = require("truffle-hdwallet-provider");
require('dotenv').config();

const web3 = require('web3')
const { toWei } = web3.utils

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      gasPrice: 1,
      gas: 6700000
    },
    kovan: {
      provider: function() {
        return new HDWalletProvider(`${process.env.MNEMONIC}`, "https://kovan.infura.io/v3/53bcde36e0404a6da87b71e780783f79")
      },
      network_id: 42,
      gas: 6700000,
      skipDryRun: true
    },
    mainnet: {
      provider: function() {
        return new HDWalletProvider(`${process.env.MNEMONIC}`, "https://mainnet.infura.io/v3/53bcde36e0404a6da87b71e780783f79")
      },
      network_id: 1,
      gasPrice: toWei('10', 'gwei'),
      skipDryRun: true
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555,         // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    }
  },
  compilers: {
    solc: {
      version: "0.5.10",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: 'petersburg'
      },
    },
  },
  plugins: [
    'truffle-plugin-verify',
    'solidity-coverage'
  ],
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY
  },
  mocha: {
    reporter: 'eth-gas-reporter'
  }
};
