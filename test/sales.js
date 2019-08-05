const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

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

contract("Sales", accounts => {
  const lender   = accounts[0]
  const borrower = accounts[1]
  const agent    = accounts[2]
  const bidr     = accounts[3]
  const bidr2    = accounts[4]

  const sig1  = '0x3045022100acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig2  = '0x3045022101acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig3  = '0x3045022102acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig4  = '0x3045022103acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig5  = '0x3045022104acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig6  = '0x3045022105acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig7  = '0x3045022106acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig8  = '0x3045022107acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig9  = '0x3045022108acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig10 = '0x3045022109acb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig11 = '0x304502210aacb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'
  const sig12 = '0x304502210bacb79a21e7e6cea47a598254e02639f87b5fa9a08c0ec8455503da0a479c19560220724014c241ac64ffc108d4457302644d5d057fbc4f2edbf33a86f24cf0b10447'

  let currentTime
  let btcPrice

  const loanReq = 5; // 5 DAI
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
      agent
    ]

    this.fund = await this.funds.create.call(...fundParams)
    await this.funds.create(...fundParams)

    // Generate lender secret hashes
    await this.funds.generate(lendSechs)

    // Generate agent secret hashes
    await this.funds.generate(agentSechs, { from: agent })

    // Set Lender PubKey
    await this.funds.update(ensure0x(lendpubk))

    // Push funds to loan fund
    await this.token.approve(this.funds.address, toWei('100', 'ether'))
    await this.funds.deposit(this.fund, toWei('100', 'ether'))

    // Pull from loan
    const loanParams = [
      this.fund,
      toWei(loanReq.toString(), 'ether'),
      col,
      toSecs({days: 2}),
      borSechs,
      ensure0x(lendpubk)
    ]

    this.loan = await this.funds.request.call(...loanParams, { from: borrower })
    await this.funds.request(...loanParams, { from: borrower })

    await this.loans.approve(this.loan)

    await this.loans.take(this.loan, borSecs[0], { from: borrower })

    const bal = await this.token.balanceOf.call(borrower)

    await this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

    const safe = await this.loans.safe.call(this.loan)
    assert.equal(safe, false)
  })

  describe('push', function() {
    it('should allow bidders to bid until end of auction period', async function() {
      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('100', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('100', 'ether'))
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
      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('100', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 61}))

      await this.token.transfer(bidr2, toWei('100', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await expectRevert(this.sales.push(this.sale, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('3 auctions', function() {
    it('should allow for 3 auctions before considered failed', async function() {
      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

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

      this.sale2 = await this.loans.liquidate.call(this.loan, { from: lender })
      await this.loans.liquidate(this.loan, { from: lender })

      await this.sales.push(this.sale2, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.sales.push(this.sale2, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({hours: 4, minutes: 2}))

      this.sale3 = await this.loans.liquidate.call(this.loan, { from: lender })
      await this.loans.liquidate(this.loan, { from: lender })

      await this.sales.push(this.sale3, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.sales.push(this.sale3, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({hours: 4, minutes: 2}))

      await expectRevert(this.loans.liquidate(this.loan, { from: lender }), 'VM Exception while processing transaction: revert')
    })

    it('should fail if auction called before previous auction is finished', async function() {
      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

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

      await expectRevert(this.loans.liquidate(this.loan, { from: bidr }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('take', function() {
    it('should disperse funds to rightful parties after partial repayment', async function() {
      await this.token.approve(this.loans.address, toWei('100', 'ether'), { from: borrower })

      const owed = await this.loans.owed.call(this.loan)
      await this.loans.repay(this.loan, BigNumber(owed).dividedBy(2).toFixed(0), { from: borrower })

      await this.med.poke(numToBytes32(toWei((btcPrice * 0.35).toString(), 'ether')))

      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.45).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.75).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({minutes: 2}))

      await this.sales.sec(this.sale, lendSecs[1])
      await this.sales.sec(this.sale, borSecs[1], { from: borrower })
      await this.sales.sec(this.sale, bidrSecs[1])

      const lendBalBefore  = await this.token.balanceOf.call(lender)
      const borBalBefore   = await this.token.balanceOf.call(borrower)
      const agentBalBefore = await this.token.balanceOf.call(agent)

      await this.sales.take(this.sale)

      const lendBalAfter  = await this.token.balanceOf.call(lender)
      const borBalAfter   = await this.token.balanceOf.call(borrower)
      const agentBalAfter = await this.token.balanceOf.call(agent)

      const lent = await this.loans.lent.call(this.loan)
      const fee  = await this.loans.fee.call(this.loan)
      const penalty = await this.loans.penalty.call(this.loan)
      const back = await this.loans.back.call(this.loan)
      const dedu = await this.loans.dedu.call(this.loan)
      const bid  = await this.sales.bid.call(this.sale)

      assert.equal(BigNumber(lendBalBefore).plus(lent).toFixed(), lendBalAfter.toString())
      assert.equal(BigNumber(borBalBefore).plus(BigNumber(bid).plus(back).minus(dedu)).toString(), borBalAfter.toString())
      assert.equal(BigNumber(agentBalBefore).plus(fee).toString(), agentBalAfter)

      const taken = await this.sales.taken.call(this.sale)
      assert.equal(taken, true)
    })

    it('should disperse all funds to lender if bid + back doesn\'t cover principal + interest', async function() {
      await this.token.approve(this.loans.address, toWei('100', 'ether'), { from: borrower })

      const owed = await this.loans.owed.call(this.loan)
      await this.loans.repay(this.loan, BigNumber(owed).dividedBy(2).toFixed(0), { from: borrower })

      await this.med.poke(numToBytes32(toWei((btcPrice * 0.35).toString(), 'ether')))

      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.45).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.5).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({minutes: 2}))

      await this.sales.sec(this.sale, lendSecs[1])
      await this.sales.sec(this.sale, borSecs[1], { from: borrower })
      await this.sales.sec(this.sale, bidrSecs[1])

      const lendBalBefore  = await this.token.balanceOf.call(lender)
      const borBalBefore   = await this.token.balanceOf.call(borrower)
      const agentBalBefore = await this.token.balanceOf.call(agent)

      await this.sales.take(this.sale)

      const lendBalAfter  = await this.token.balanceOf.call(lender)
      const borBalAfter   = await this.token.balanceOf.call(borrower)
      const agentBalAfter = await this.token.balanceOf.call(agent)

      const lent = await this.loans.lent.call(this.loan)
      const fee  = await this.loans.fee.call(this.loan)
      const penalty = await this.loans.penalty.call(this.loan)
      const back = await this.loans.back.call(this.loan)
      const dedu = await this.loans.dedu.call(this.loan)
      const bid  = await this.sales.bid.call(this.sale)

      assert.equal(BigNumber(lendBalBefore).plus(BigNumber(bid).plus(back)).toFixed(), lendBalAfter.toString())
      assert.equal(borBalBefore.toString(), borBalAfter.toString())
      assert.equal(agentBalBefore.toString(), agentBalAfter)

      const taken = await this.sales.taken.call(this.sale)
      assert.equal(taken, true)
    })

    it('should disperse all remaining funds to medianizer if funds have been paid to lender but not enough is needed to pay agent and medianizer', async function() {
      await this.token.approve(this.loans.address, toWei('100', 'ether'), { from: borrower })

      const owed = await this.loans.owed.call(this.loan)
      await this.loans.repay(this.loan, BigNumber(owed).dividedBy(2).toFixed(0), { from: borrower })

      await this.med.poke(numToBytes32(toWei((btcPrice * 0.35).toString(), 'ether')))

      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.45).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('5', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.715142637307).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({minutes: 2}))

      await this.sales.sec(this.sale, lendSecs[1])
      await this.sales.sec(this.sale, borSecs[1], { from: borrower })
      await this.sales.sec(this.sale, bidrSecs[1])

      const lendBalBefore  = await this.token.balanceOf.call(lender)
      const borBalBefore   = await this.token.balanceOf.call(borrower)
      const agentBalBefore = await this.token.balanceOf.call(agent)
      const medBalBefore   = await this.token.balanceOf.call(this.med.address)

      await this.sales.take(this.sale)

      const lendBalAfter  = await this.token.balanceOf.call(lender)
      const borBalAfter   = await this.token.balanceOf.call(borrower)
      const agentBalAfter = await this.token.balanceOf.call(agent)
      const medBalAfter   = await this.token.balanceOf.call(this.med.address)

      const lent = await this.loans.lent.call(this.loan)
      const fee  = await this.loans.fee.call(this.loan)
      const penalty = await this.loans.penalty.call(this.loan)
      const back = await this.loans.back.call(this.loan)
      const dedu = await this.loans.dedu.call(this.loan)
      const bid  = await this.sales.bid.call(this.sale)

      assert.equal(BigNumber(lendBalBefore).plus(lent).toFixed(), lendBalAfter.toString())
      assert.equal(borBalBefore.toString(), borBalAfter.toString())
      assert.equal(agentBalBefore.toString(), agentBalAfter.toString())
      assert.equal(BigNumber(medBalBefore).plus(BigNumber(bid).plus(back).minus(lent)).toString(), medBalAfter.toString())

      const taken = await this.sales.taken.call(this.sale)
      assert.equal(taken, true)
    })
  })

  describe('sign', function() {
    it('should allow parties to sign and retrieve their signatures', async function() {
      this.sale = await this.loans.liquidate.call(this.loan, { from: bidr })
      await this.loans.liquidate(this.loan, { from: bidr })

      const colvWei = await this.loans.colv.call(this.loan)
      const colv = fromWei(colvWei)

      const col = await this.loans.col.call(this.loan)

      await this.token.transfer(bidr, toWei('100', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr })

      await this.sales.push(this.sale, toWei((colv * 0.9).toString()), bidrSechs[0], ensure0x(bidrpbkh), { from: bidr })

      await time.increase(toSecs({minutes: 59}))

      await this.token.transfer(bidr2, toWei('100', 'ether'))
      await this.token.approve(this.sales.address, toWei('100', 'ether'), { from: bidr2 })

      await this.sales.push(this.sale, toWei((colv * 0.92).toString()), bidrSechs[1], ensure0x(bidrpbkh), { from: bidr2 })

      await time.increase(toSecs({minutes: 2}))

      await this.sales.sign(this.sale, sig1, sig2, sig3, sig4, { from: borrower })
      await this.sales.sign(this.sale, sig5, sig6, sig7, sig8, { from: lender })
      await this.sales.sign(this.sale, sig9, sig10, sig11, sig12, { from: agent })

      const bsigs = await this.sales.bsigs.call(this.sale)
      const lsigs = await this.sales.lsigs.call(this.sale)
      const asigs = await this.sales.asigs.call(this.sale)

      assert.equal(bsigs[0], sig1)
      assert.equal(bsigs[1], sig2)
      assert.equal(bsigs[2], sig3)
      assert.equal(bsigs[3], sig4)

      assert.equal(lsigs[0], sig5)
      assert.equal(lsigs[1], sig6)
      assert.equal(lsigs[2], sig7)
      assert.equal(lsigs[3], sig8)

      assert.equal(asigs[0], sig9)
      assert.equal(asigs[1], sig10)
      assert.equal(asigs[2], sig11)
      assert.equal(asigs[3], sig12)

      await this.sales.sec(this.sale, lendSecs[1])
      await this.sales.sec(this.sale, borSecs[1], { from: borrower })
      await this.sales.sec(this.sale, bidrSecs[1])

      await this.sales.take(this.sale)

      const taken = await this.sales.taken.call(this.sale)
      assert.equal(taken, true)
    })
  })
})