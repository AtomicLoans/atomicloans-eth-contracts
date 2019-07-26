const { time, shouldFail, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x, remove0x   }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
const axios         = require('axios');

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Med   = artifacts.require("./MedianizerExample.sol");

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const API_ENDPOINT_COIN = "https://atomicloans.io/marketcap/api/v1/"
const BTC_TO_SAT = 10**8

async function fetchCoin(coinName) {
  const url = `${API_ENDPOINT_COIN}${coinName}/`;
  return (await axios.get(url)).data[0].price_usd; // this returns a promise - stored in 'request'
}

contract("Loans", accounts => {
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

  let agentSecs = []
  let agentSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    agentSecs.push(ensure0x(sec))
    agentSechs.push(ensure0x(sha256(sec)))
  }

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
      this.token.address
    ]

    this.fund = await this.funds.open.call(...fundParams)
    await this.funds.open(...fundParams)

    // Generate lender secret hashes
    await this.funds.gen(lendSechs)

    // Generate agent secret hashes
    await this.funds.gen(agentSechs, { from: agent })

    // Set Lender PubKey
    await this.funds.set(ensure0x(lendpubk))

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
      ensure0x(lendpubk)
    ]

    this.loan = await this.funds.req.call(...loanParams, { from: borrower })
    await this.funds.req(...loanParams, { from: borrower })
  })

  describe('pull', function() {
    it('should pull successfully if lender secret provided', async function() {
      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      // Send funds to borrower so they can repay full
      await this.token.transfer(borrower, toWei('1', 'ether'))

      await this.token.approve(this.loans.address, toWei('100', 'ether'), { from: borrower })

      const owed = await this.loans.owed.call(this.loan)
      await this.loans.pay(this.loan, owed, { from: borrower })

      await this.loans.pull(this.loan, lendSecs[0]) // accept loan repayment

      const off = await this.loans.off.call(this.loan)
      assert.equal(off, true);
    })

    it('should pull successfully if agent secret provided', async function() {
      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      // Send funds to borrower so they can repay full
      await this.token.transfer(borrower, toWei('1', 'ether'))

      await this.token.approve(this.loans.address, toWei('100', 'ether'), { from: borrower })

      const owed = await this.loans.owed.call(this.loan)
      await this.loans.pay(this.loan, owed, { from: borrower })

      await this.loans.pull(this.loan, agentSecs[0]) // accept loan repayment

      const off = await this.loans.off.call(this.loan)
      assert.equal(off, true);
    })
  })

  describe('sell', function() {
    it('should be safe if above liquidation ratio', async function() {
      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      const bal = await this.token.balanceOf.call(borrower)

      const safe = await this.loans.safe.call(this.loan)
      assert.equal(safe, true)
    })

    it('should succeed at creating a sale if below liquidation ratio', async function() {
      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      const bal = await this.token.balanceOf.call(borrower)

      this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

      const safe = await this.loans.safe.call(this.loan)
      assert.equal(safe, false)

      this.sale = await this.loans.sell.call(this.loan, { from: bidr })
      await this.loans.sell(this.loan, { from: bidr })

      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(1800)

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(1800 + 1)

      await this.sales.sec(this.sale, lendSecs[1])
      await this.sales.sec(this.sale, borSecs[1], { from: borrower })
      await this.sales.sec(this.sale, bidrSecs[1])

      await this.sales.take(this.sale)

      const taken = await this.sales.taken.call(this.sale)
      assert.equal(taken, true)
    })
  })

  describe('default', function() {
    it('should fail liquidation if current time before loan expiration', async function() {
      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      await time.increase(toSecs({days: 1, hours: 23}))

      await shouldFail.reverting(this.loans.sell(this.loan, { from: bidr }))
    })

    it('should allow for liquidation to start if loan is defaulted', async function() {
      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      await time.increase(toSecs({days: 2, minutes: 1}))

      this.sale = await this.loans.sell.call(this.loan, { from: bidr })
      await this.loans.sell(this.loan, { from: bidr })

      const sale = await this.loans.sale.call(this.loan)
      assert.equal(sale, true)
    })
  })

  describe('setSales', function() {
    it('should not allow setSales to be called twice', async function() {
      await shouldFail.reverting(this.loans.setSales(this.loans.address))
    })
  })
})