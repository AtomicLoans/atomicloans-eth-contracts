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
const Cur   = artifacts.require('./BTCCurrency.sol');
const Vars  = artifacts.require('./VarsExample.sol');

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const API_ENDPOINT_COIN = "https://atomicloans.io/marketcap/api/v1/"
const BTC_TO_SAT = 10**8

async function fetchCoin(coinName) {
  const url = `${API_ENDPOINT_COIN}${coinName}/`;
  return (await axios.get(url)).data[0].price_usd; // this returns a promise - stored in 'request'
}

contract("Sales", accounts => {
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
    this.cur   = await Cur.deployed();
    this.vars  = await Vars.deployed();

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

    await this.loans.mark(this.loan)

    await this.loans.take(this.loan, borSecs[0], { from: borrower })

    const bal = await this.token.balanceOf.call(borrower)

    this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

    const safe = await this.loans.safe.call(this.loan)
    assert.equal(safe, false)

    this.sale = await this.loans.sell.call(this.loan, { from: bidr })
    await this.loans.sell(this.loan, { from: bidr })
  })

  describe('push', function() {
    it('should allow bidders to bid until end of auction period', async function() {
      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({minutes: 2}))

      await this.sales.sec(this.sale, lendSecs[1])
      await this.sales.sec(this.sale, borSecs[1], { from: borrower })
      await this.sales.sec(this.sale, bidrSecs[1])

      await this.sales.take(this.sale)

      const taken = await this.sales.taken.call(this.sale)
      assert.equal(taken, true)
    })

    it('should fail if bidders try to bid after end of auction period', async function() {
      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 61}))

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await shouldFail.reverting(this.sales.push(this.sale, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 }))
    })
  })

  describe('3 auctions', function() {
    it('should allow for 3 auctions before considered failed', async function() {
      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({hours: 4, minutes: 2}))

      this.sale2 = await this.loans.sell.call(this.loan, { from: lender })
      await this.loans.sell(this.loan, { from: lender })

      await this.sales.push(this.sale2, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.sales.push(this.sale2, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({hours: 4, minutes: 2}))

      this.sale3 = await this.loans.sell.call(this.loan, { from: lender })
      await this.loans.sell(this.loan, { from: lender })

      await this.sales.push(this.sale3, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.sales.push(this.sale3, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({hours: 4, minutes: 2}))

      await shouldFail.reverting(this.loans.sell(this.loan, { from: lender }))
    })

    it('should fail if auction called before previous auction is finished', async function() {
      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({minutes: 2}))

      await shouldFail.reverting(this.loans.sell(this.loan, { from: bidr }))
    })
  })
})