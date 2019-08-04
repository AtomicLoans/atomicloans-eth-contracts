const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
const axios         = require('axios');

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Med   = artifacts.require("./Medianizer.sol");

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const API_ENDPOINT_COIN = "https://atomicloans.io/marketcap/api/v1/"
const BTC_TO_SAT = 10**8

async function fetchCoin(coinName) {
  const url = `${API_ENDPOINT_COIN}${coinName}/`;
  return (await axios.get(url)).data[0].price_usd; // this returns a promise - stored in 'request'
}

contract("Funds", accounts => {
  const lender = accounts[0]
  const borrower = accounts[1]
  const agent = accounts[2]

  let currentTime
  let btcPrice

  const loanReq = 1; // 5 DAI
  const loanRat = 2; // Collateralization ratio of 200%

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

  beforeEach(async function () {
    currentTime = await time.latest();
    // btcPrice = await fetchCoin('bitcoin')
    btcPrice = '9340.23'

    this.funds = await Funds.deployed();
    this.loans = await Loans.deployed();
    this.sales = await Sales.deployed();
    this.token = await ExampleCoin.deployed();

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
  })

  describe('generate secret hashes', function() {
    it('should push secrets hashes to sechs for user address', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      const sech0 = await this.funds.sechs.call(lender, 0)
      const sech1 = await this.funds.sechs.call(lender, 1)
      const sech2 = await this.funds.sechs.call(lender, 2)
      const sech3 = await this.funds.sechs.call(lender, 3)

      assert.equal(lendSechs[0], sech0);
      assert.equal(lendSechs[1], sech1);
      assert.equal(lendSechs[2], sech2);
      assert.equal(lendSechs[3], sech3);
    })

    it('should fail trying to return incorrect sechs index', async function() {
      try {
        await this.funds.sechs.call(lender, 20)
      } catch (error) {
        return utils.ensureException(error);
      }
      assert.fail('Expected exception not received');
    })
  })

  describe('push funds', function() {
    it('should allow anyone to push funds to loan fund', async function() {
      await this.token.transfer(agent, toWei('100', 'ether'))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'ether'), { from: agent })
      await this.funds.deposit(this.fund, toWei('100', 'ether'), { from: agent })

      const bal = await this.token.balanceOf.call(this.funds.address)

      assert.equal(bal.toString(), toWei('100', 'ether'));
    })

    it('should request and complete loan successfully if loan setup correctly', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Lender PubKey
      await this.funds.update(ensure0x(lendpubk))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      // request collateralization ratio 2
      const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

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
  })

  describe('opening loan fund', function() {
    it('should increment fundi', async function() {
      const initFundi = await this.funds.fundi.call()

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

      const finalFundi = await this.funds.fundi.call()

      assert.equal(finalFundi - initFundi, 1)
    })
  })

  describe('set fund details', function() {
    it('should allow changing of pubk', async function() {
      const oldPubk = await this.funds.pubks.call(lender)

      const newLendpubk = '024f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'

      // Set Lender PubKey
      await this.funds.update(ensure0x(newLendpubk))

      const newPubk = await this.funds.pubks.call(lender)

      assert.notEqual(oldPubk, newPubk)
    })

    it('should allow changing of fund details', async function() {
      const fundParams = [
        toWei('2', 'ether'),
        toWei('99', 'ether'),
        toSecs({days: 2}),
        toSecs({days: 364}),
        toWei(rateToSec('16'), 'gether'), // 16.0%
        toWei(rateToSec('2.75'), 'gether'), //  3.00%
        toWei(rateToSec('0.5'), 'gether'), //  0.75%
        toWei('1.5', 'gether'), // 150% collateralization ratio
        agent
      ]

      await this.funds.update(this.fund, ...fundParams)

      const mila = await this.funds.mila.call(this.fund)
      const mala = await this.funds.mala.call(this.fund)
      const mild = await this.funds.mild.call(this.fund)
      const mald = await this.funds.mald.call(this.fund)
      const interest = await this.funds.interest.call(this.fund)
      const penalty = await this.funds.penalty.call(this.fund)
      const fee  = await this.funds.fee.call(this.fund)
      const rat  = await this.funds.rat.call(this.fund)

      assert.equal(mila, toWei('2', 'ether'))
      assert.equal(mala, toWei('99', 'ether'))
      assert.equal(mild, toSecs({days: 2}))
      assert.equal(mald, toSecs({days: 364}))
      assert.equal(interest, toWei(rateToSec('16'), 'gether'))
      assert.equal(penalty, toWei(rateToSec('2.75'), 'gether'))
      assert.equal(fee, toWei(rateToSec('0.5'), 'gether'))
      assert.equal(rat, toWei('1.5', 'gether'))
    })
  })

  describe('withdraw funds', function() {
    it('should withdraw funds successfully if called by owner', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Lender PubKey
      await this.funds.update(ensure0x(lendpubk))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const oldBal = await this.token.balanceOf.call(this.funds.address)

      // Pull funds from loan fund
      await this.funds.withdraw(this.fund, toWei('50', 'ether'))

      const newBal = await this.token.balanceOf.call(this.funds.address)

      assert.equal(oldBal - newBal, toWei('50', 'ether'))
    })

    it('should fail pulling funds if not called by owner', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Lender PubKey
      await this.funds.update(ensure0x(lendpubk))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      // Pull funds from loan fund
      await expectRevert(this.funds.withdraw(this.fund, toWei('50', 'ether'), { from: agent }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('setLoans', function() {
    it('should not allow setLoans to be called twice', async function() {
      await expectRevert(this.funds.setLoans(this.loans.address), 'VM Exception while processing transaction: revert')
    })
  })
})
