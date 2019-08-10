const { Client, Provider, providers, crypto } = require('@mblackmblack/bundle')
const { LoanClient, providers: lproviders } = require('../../../../chainabstractionlayer-loans/packages/loan-bundle/dist/index.cjs.js')
const config = require('./config.js')

const bitcoinNetworks = providers.bitcoin.networks
const client = new Client()
const bitcoinLoan = new LoanClient(client)
client.loan = bitcoinLoan
client.addProvider(new providers.bitcoin.BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
client.loan.addProvider(new lproviders.bitcoin.BitcoinCollateralProvider({ network: bitcoinNetworks[config.bitcoin.network] }, { script: 'p2wsh', address: 'p2wpkh'}))
client.loan.addProvider(new lproviders.bitcoin.BitcoinCollateralSwapProvider({ network: bitcoinNetworks[config.bitcoin.network] }, { script: 'p2wsh', address: 'p2wpkh'}))

const bitcoin = { client }

module.exports = {
  bitcoin
};
