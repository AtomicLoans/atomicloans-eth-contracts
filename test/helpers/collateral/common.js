const { Client, Provider, providers, crypto } = require('@mblackmblack/bundle')
const { LoanClient, providers: lproviders } = require('@atomicloans/loan-bundle')
const config = require('./config.js')

const bitcoinNetworks = providers.bitcoin.networks
const bitcoin = new Client()
const bitcoinLoan = new LoanClient(bitcoin)
bitcoin.loan = bitcoinLoan
bitcoin.addProvider(new providers.bitcoin.BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoin.loan.addProvider(new lproviders.bitcoin.BitcoinCollateralProvider({ network: bitcoinNetworks[config.bitcoin.network] }, { script: 'p2sh', address: 'p2wpkh'}))
bitcoin.loan.addProvider(new lproviders.bitcoin.BitcoinCollateralSwapProvider({ network: bitcoinNetworks[config.bitcoin.network] }, { script: 'p2sh', address: 'p2wpkh'}))

module.exports = {
  bitcoin
};
