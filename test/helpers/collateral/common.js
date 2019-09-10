const { Client, Provider, providers, crypto } = require('@liquality/bundle')
const { LoanClient, providers: lproviders } = require('@atomicloans/loan-bundle')
const config = require('./config.js')

const bitcoinNetworks = providers.bitcoin.networks
const client = new Client()
const bitcoinLoan = new LoanClient(client)
client.loan = bitcoinLoan
client.addProvider(new providers.bitcoin.BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
client.addProvider(new providers.bitcoin.BitcoinNodeWalletProvider(bitcoinNetworks[config.bitcoin.network], config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password, 'bech32'))
client.loan.addProvider(new lproviders.bitcoin.BitcoinCollateralProvider({ network: bitcoinNetworks[config.bitcoin.network] }, { script: 'p2wsh', address: 'p2wpkh'}))
client.loan.addProvider(new lproviders.bitcoin.BitcoinCollateralSwapProvider({ network: bitcoinNetworks[config.bitcoin.network] }, { script: 'p2wsh', address: 'p2wpkh'}))

const bitcoin = { client }

module.exports = {
  bitcoin
};
