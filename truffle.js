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
    }
  },
  compilers: {
    solc: {
      version: "0.5.8",
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
    'truffle-plugin-verify'
  ],
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY
  }
};
