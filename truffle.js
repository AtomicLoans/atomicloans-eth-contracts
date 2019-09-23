var HDWalletProvider = require("truffle-hdwallet-provider");
require('dotenv').config();

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
      gas: 6690000,
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
        evmVersion: 'byzantium'
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
