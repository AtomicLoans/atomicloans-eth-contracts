const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
const axios         = require('axios');

const ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
const USDCInterestRateModel = artifacts.require('./USDCInterestRateModel.sol')
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Medianizer = artifacts.require('./MedianizerExample.sol');

const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');
const Comptroller = artifacts.require('./Comptroller.sol')

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const BTC_TO_SAT = 10**8

contract("Usdc Funds", accounts => {
  const lender = accounts[0]
  const borrower = accounts[1]
  const agent = accounts[2]
  const lender2 = accounts[3]
  const lender3 = accounts[4]

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
  
  const borpubk = '02b4c50d2b6bdc9f45b9d705eeca37e811dfdeb7365bf42f82222f7a4a89868703'
  const lendpubk = '03dc23d80e1cf6feadf464406e299ac7fec9ea13c51dfd9abd970758bf33d89bb6'
  const agentpubk = '02688ce4b6ca876d3e0451e6059c34df4325745c1f7299ebc108812032106eaa32'

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

    btcPrice = '9340.23'

    this.med = await Medianizer.deployed()

    this.token = await ExampleUsdcCoin.deployed()
    this.comptroller = await Comptroller.deployed()
    this.usdcInterestRateModel = await USDCInterestRateModel.deployed()

    this.cUsdc = await CErc20.new(this.token.address, this.comptroller.address, this.usdcInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Usdc', 'cUSDC', '8')

    await this.comptroller._supportMarket(this.cUsdc.address)

    this.funds = await Funds.new(this.token.address, '6')
    await this.funds.setCompound(this.cUsdc.address, this.comptroller.address)

    this.loans = await Loans.new(this.funds.address, this.med.address, this.token.address, '6')

    this.sales = await Sales.new(this.loans.address, this.med.address, this.token.address)

    await this.funds.setLoans(this.loans.address)
    await this.loans.setSales(this.sales.address)

    const fundParams = [
      toWei('1', 'mwei'),
      toWei('100', 'mwei'),
      toSecs({days: 1}),
      toSecs({days: 366}),
      toWei('1.5', 'gether'), // 150% collateralization ratio
      toWei(rateToSec('16.5'), 'gether'), // 16.50%
      toWei(rateToSec('3'), 'gether'), //  3.00%
      toWei(rateToSec('0.75'), 'gether'), //  0.75%
      agent, 
      false,
      0
    ]

    this.fund = await this.funds.createCustom.call(...fundParams)
    await this.funds.createCustom(...fundParams)
  })

  describe('create', function() {
    it('should fail if user tries to create two loan funds', async function() {
      const fundParams = [
        toSecs({days: 366}),
        agent,
        false,
        0
      ]

      await this.funds.create(...fundParams, { from: lender2 })

      await expectRevert(this.funds.create(...fundParams, { from: lender2 }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('createCustom', function() {
    it('should fail if user tries to create two loan funds', async function() {
      const fundParams = [
        toWei('1', 'mwei'),
        toWei('100', 'mwei'),
        toSecs({days: 1}),
        toSecs({days: 366}),
        toWei('1.5', 'gether'), // 150% collateralization ratio
        toWei(rateToSec('16.5'), 'gether'), // 16.50%
        toWei(rateToSec('3'), 'gether'), //  3.00%
        toWei(rateToSec('0.75'), 'gether'), //  0.75%
        agent,
        false,
        0
      ]

      await this.funds.createCustom(...fundParams, { from: lender3 })

      await expectRevert(this.funds.createCustom(...fundParams, { from: lender3 }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('generate secret hashes', function() {
    it('should push secrets hashes to secretHashes for user address', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      const sech0 = await this.funds.secretHashes.call(lender, 0)
      const sech1 = await this.funds.secretHashes.call(lender, 1)
      const sech2 = await this.funds.secretHashes.call(lender, 2)
      const sech3 = await this.funds.secretHashes.call(lender, 3)

      assert.equal(lendSechs[0], sech0);
      assert.equal(lendSechs[1], sech1);
      assert.equal(lendSechs[2], sech2);
      assert.equal(lendSechs[3], sech3);
    })

    it('should fail trying to return incorrect secretHashes index', async function() {
      try {
        await this.funds.secretHashes.call(lender, 20)
      } catch (error) {
        return utils.ensureException(error);
      }
      assert.fail('Expected exception not received');
    })
  })

  describe('push funds', function() {
    it('should allow anyone to push funds to loan fund', async function() {
      await this.token.transfer(agent, toWei('100', 'mwei'))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'mwei'), { from: agent })
      await this.funds.deposit(this.fund, toWei('100', 'mwei'), { from: agent })

      const bal = await this.token.balanceOf.call(this.funds.address)

      assert.equal(bal.toString(), toWei('100', 'mwei'));
    })

    it('should request and complete loan successfully if loan setup correctly', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Agent PubKey
      await this.funds.setPubKey(ensure0x(agentpubk), { from: agent })

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'mwei'))
      await this.funds.deposit(this.fund, toWei('100', 'mwei'))

      // request collateralization ratio 2
      const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      const loanParams = [
        this.fund,
        borrower,
        toWei(loanReq.toString(), 'mwei'),
        col,
        toSecs({days: 2}),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      this.loan = await this.funds.request.call(...loanParams)
      await this.funds.request(...loanParams)

      await this.loans.approve(this.loan)

      await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

      // Send funds to borrower so they can repay full
      await this.token.transfer(borrower, toWei('1', 'mwei'))

      await this.token.approve(this.loans.address, toWei('100', 'mwei'), { from: borrower })

      const owedForLoan = await this.loans.owedForLoan.call(this.loan)
      await this.loans.repay(this.loan, owedForLoan, { from: borrower })

      await this.loans.accept(this.loan, lendSecs[0]) // accept loan repayment

      const off = await this.loans.off.call(this.loan)

      assert.equal(off, true);
    })    
  })

  describe('opening loan fund', function() {
    it('should increment fundIndex', async function() {
      const initFundIndex = await this.funds.fundIndex.call()

      const fundParams = [
        toWei('1', 'mwei'),
        toWei('100', 'mwei'),
        toSecs({days: 1}),
        toSecs({days: 366}),
        toWei('1.5', 'gether'), // 150% collateralization ratio
        toWei(rateToSec('16.5'), 'gether'), // 16.50%
        toWei(rateToSec('3'), 'gether'), //  3.00%
        toWei(rateToSec('0.75'), 'gether'), //  0.75%
        agent,
        false,
        0
      ]

      this.fund = await this.funds.createCustom.call(...fundParams)
      await this.funds.createCustom(...fundParams)

      const finalFundIndex = await this.funds.fundIndex.call()

      assert.equal(finalFundIndex - initFundIndex, 1)
    })
  })

  describe('set fund details', function() {
    it('should allow changing of pubk', async function() {
      const oldPubk = await this.funds.pubKeys.call(lender)

      const newLendpubk = '024f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(newLendpubk))

      const newPubk = await this.funds.pubKeys.call(lender)

      assert.notEqual(oldPubk, newPubk)
    })

    it('should allow changing of fund details', async function() {
      const fundParams = [
        toWei('2', 'mwei'),
        toWei('99', 'mwei'),
        toSecs({days: 2}),
        toSecs({days: 364}),
        toWei(rateToSec('16'), 'gether'), // 16.0%
        toWei(rateToSec('2.75'), 'gether'), //  3.00%
        toWei(rateToSec('0.5'), 'gether'), //  0.75%
        toWei('1.5', 'gether'), // 150% collateralization ratio
        agent
      ]

      await this.funds.update(this.fund, ...fundParams)

      const minLoanAmt = await this.funds.minLoanAmt.call(this.fund)
      const maxLoanAmt = await this.funds.maxLoanAmt.call(this.fund)
      const minLoanDur = await this.funds.minLoanDur.call(this.fund)
      const maxLoanDur = await this.funds.maxLoanDur.call(this.fund)
      const interest = await this.funds.interest.call(this.fund)
      const penalty = await this.funds.penalty.call(this.fund)
      const fee  = await this.funds.fee.call(this.fund)
      const liquidationRatio = await this.funds.liquidationRatio.call(this.fund)

      assert.equal(minLoanAmt, toWei('2', 'mwei'))
      assert.equal(maxLoanAmt, toWei('99', 'mwei'))
      assert.equal(minLoanDur, toSecs({days: 2}))
      assert.equal(maxLoanDur, toSecs({days: 364}))
      assert.equal(interest, toWei(rateToSec('16'), 'gether'))
      assert.equal(penalty, toWei(rateToSec('2.75'), 'gether'))
      assert.equal(fee, toWei(rateToSec('0.5'), 'gether'))
      assert.equal(liquidationRatio, toWei('1.5', 'gether'))
    })
  })

  describe('withdraw funds', function() {
    it('should withdraw funds successfully if called by owner', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(lendpubk))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'mwei'))
      await this.funds.deposit(this.fund, toWei('100', 'mwei'))

      const oldBal = await this.token.balanceOf.call(this.funds.address)

      // Pull funds from loan fund
      await this.funds.withdraw(this.fund, toWei('50', 'mwei'))

      const newBal = await this.token.balanceOf.call(this.funds.address)

      assert.equal(oldBal - newBal, toWei('50', 'mwei'))
    })

    it('should fail withdrawing funds if not called by owner', async function() {
      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(lendpubk))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'mwei'))
      await this.funds.deposit(this.fund, toWei('100', 'mwei'))

      // Pull funds from loan fund
      await expectRevert(this.funds.withdraw(this.fund, toWei('50', 'mwei'), { from: agent }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('setLoans', function() {
    it('should not allow setLoans to be called twice', async function() {
      await expectRevert(this.funds.setLoans(this.loans.address), 'VM Exception while processing transaction: revert')
    })
  })
})
