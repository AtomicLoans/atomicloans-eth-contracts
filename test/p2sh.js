const { time, shouldFail, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256, hash160 }    = require('@liquality/crypto')
const { ensure0x, remove0x   }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
const axios         = require('axios');

const { Client, providers, crypto } = require('@liquality/bundle');
const LoanBundle = require('@atomicloans/loan-bundle');
const LoanClient = require('@atomicloans/loan-client');
const lproviders = LoanBundle.providers
let bitcoin = new Client()
const loan = new LoanClient(bitcoin)
bitcoin.loan = loan
const bitcoinNetworks = providers.bitcoin.BitcoinNetworks
bitcoin.loan.addProvider(new lproviders.bitcoin.BitcoinCollateralAgentProvider({ network: bitcoinNetworks.bitcoin_testnet }))

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Med   = artifacts.require("./MedianizerExample.sol");
const Cur   = artifacts.require('./BTCCurrency.sol');
const Vars  = artifacts.require('./VarsExample.sol');
const P2SH  = artifacts.require('./P2SH.sol');

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei, asciiToHex } = web3.utils;

const API_ENDPOINT_COIN = "https://atomicloans.io/marketcap/api/v1/"
const BTC_TO_SAT = 10**8

async function fetchCoin(coinName) {
  const url = `${API_ENDPOINT_COIN}${coinName}/`;
  return (await axios.get(url)).data[0].price_usd; // this returns a promise - stored in 'request'
}

contract("P2SH", accounts => {
  const lender   = accounts[0]
  const borrower = accounts[1]
  const agent    = accounts[2]
  const bidr     = accounts[3]
  const bidr2    = accounts[4]

  let currentTime
  let btcPrice

  const loanReq = 1; // 5 DAI
  const loanRat = 2; // Collateralization ratio of 200%
  let col;

  let lendSecs = []
  let lendSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    lendSecs.push(ensure0x(sec))
    lendSechs.push(ensure0x(sha256(sec)))
  }
  const lendpubk = '034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'

  let borSecs = []
  let borSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    borSecs.push(ensure0x(sec))
    borSechs.push(ensure0x(sha256(sec)))
  }

  const borpubk = '03f36a45ce2ec373d5d523963d8e9bac09be6e8b138cf633509701a790a4fe1b9e'

  let agentSecs = []
  let agentSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    agentSecs.push(ensure0x(sec))
    agentSechs.push(ensure0x(sha256(sec)))
  }

  const agentpubk = '030ad7d1035f9050fd10318abe924d23ea50aefed57b25ab444a9fe36979b445c7'

  let bidrSecs = []
  let bidrSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    bidrSecs.push(ensure0x(sec))
    bidrSechs.push(ensure0x(sha256(sec)))
  }

  const bidrpbkh = '7e18e6193db71abb00b70b102677675c27115871'

  beforeEach(async function () {
    currentTime = await time.latest();
    // btcPrice = await fetchCoin('bitcoin')
    btcPrice = '9340.23'

    col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

    this.funds = await Funds.deployed();
    this.loans = await Loans.deployed();
    this.sales = await Sales.deployed();
    this.token = await ExampleCoin.deployed();
    this.cur   = await Cur.deployed();
    this.vars  = await Vars.deployed();
    this.p2sh  = await P2SH.deployed();

    this.med   = await Med.deployed();

    this.med.poke(numToBytes32(toWei(btcPrice, 'ether')))

    const fundParams = [
      toWei('1', 'ether'),
      toWei('100', 'ether'),
      toSecs({days: 1}),
      toSecs({days: 366}),
      toWei('1.5', 'gether'), // 150% collateralization ratio
      toWei(rateToSec('16.5'), 'gether'), // 16.50%
      toWei(rateToSec('3'), 'gether'), //  3.00%
      toWei(rateToSec('0.75'), 'gether'), //  0.75%
      agent,
      this.token.address,
      this.cur.address,
      this.vars.address
    ]

    this.fund = await this.funds.open.call(...fundParams)
    await this.funds.open(...fundParams)

    // Generate lender secret hashes
    await this.funds.gen(lendSechs)

    // Generate agent secret hashes
    await this.funds.gen(agentSechs, { from: agent })

    // Set Lender PubKey
    await this.funds.set(ensure0x(lendpubk))

    await this.funds.set(ensure0x(agentpubk), { from: agent })

    // Push funds to loan fund
    await this.token.approve(this.funds.address, toWei('100', 'ether'))
    await this.funds.push(this.fund, toWei('100', 'ether'))

    // Pull from loan
    const loanParams = [
      this.fund,
      toWei(loanReq.toString(), 'ether'),
      col,
      toSecs({days: 2}),
      borSechs,
      ensure0x(borpubk)
    ]

    this.loan = await this.funds.req.call(...loanParams, { from: borrower })
    await this.funds.req(...loanParams, { from: borrower })
  })

  describe('getP2SH', function() {
    it('should generate p2sh pubkey and pubkeyhash correctly', async function() {
      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      // Send funds to borrower so they can repay full
      await this.token.transfer(borrower, toWei('1', 'ether'))

      await this.token.approve(this.loans.address, toWei('100', 'ether'), { from: borrower })

      const sezCol = await this.p2sh.getP2SH.call(this.loan, true);
      const refCol = await this.p2sh.getP2SH.call(this.loan, false);

      const bpubk = await this.loans.pubk.call(this.loan, asciiToHex('A'))
      const lpubk = await this.loans.pubk.call(this.loan, asciiToHex('B'))
      const apubk = await this.loans.pubk.call(this.loan, asciiToHex('C'))

      const { sechA1, sechB1, sechC1 } = await this.loans.sechs(this.loan)

      const sechA2 = await this.loans.sechi(this.loan, asciiToHex('A'))
      const sechB2 = await this.loans.sechi(this.loan, asciiToHex('B'))
      const sechC2 = await this.loans.sechi(this.loan, asciiToHex('C'))

      const loex = await this.loans.loex.call(this.loan)
      const biex = await this.loans.biex.call(this.loan)
      const siex = await this.loans.siex.call(this.loan)

      const sezScript = await bitcoin.loan.collateralAgent.createSeizableScript(remove0x(bpubk), remove0x(lpubk), remove0x(apubk), remove0x(sechA1), remove0x(sechA2), remove0x(sechB1), remove0x(sechB2), remove0x(sechC1), remove0x(sechC2), remove0x(loex), remove0x(biex), remove0x(siex))

      assert.equal(sezScript, remove0x(sezCol[0]))
      assert.equal(hash160(sezScript), remove0x(sezCol[1]))
    })
  })
})