const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const _ = require('lodash')

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber: BN } = require('bignumber.js');
const axios         = require('axios');

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Med   = artifacts.require("./Medianizer.sol");

const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');

const Comptroller = artifacts.require('./Comptroller.sol')

const Compound = artifacts.require('./ALCompound.sol');

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32, toBaseUnit } = utils;
const { toWei, fromWei } = web3.utils;

const API_ENDPOINT_COIN = "https://atomicloans.io/marketcap/api/v1/"
const BTC_TO_SAT = 10**8

const COM = 10 ** 8
const SAT = 10 ** 8
const COL = 10 ** 8
const WAD = 10 ** 18
const RAY = 10 ** 27

BN.config({ ROUNDING_MODE: BN.ROUND_DOWN })

async function fetchCoin(coinName) {
  const url = `${API_ENDPOINT_COIN}${coinName}/`;
  return (await axios.get(url)).data[0].price_usd; // this returns a promise - stored in 'request'
}

async function createFund(_this, agent, account, amount, compoundEnabled) {
  const fundParams = [
    toSecs({days: 366}),
    agent, 
    compoundEnabled
  ]

  const fund = await _this.funds.create.call(...fundParams, { from: account })
  await _this.funds.create(...fundParams, { from: account })

  await _this.token.transfer(account, amount)

  await _this.token.approve(_this.funds.address, amount, { from: account })
  await _this.funds.deposit(fund, amount, { from: account })

  return fund
}

async function createCompoundEnabledFund(_this, agent, account, amount) {
  return createFund(_this, agent, account, amount, true)
}

async function createCompoundDisabledFund(_this, agent, account, amount) {
  return createFund(_this, agent, account, amount, false)
}

contract("Compound", accounts => {
  const lender = accounts[0]
  const borrower = accounts[1]
  const agent = accounts[2]
  const lender2 = accounts[3]

  let currentTime
  let btcPrice

  const loanReq = 20; // 20 DAI
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

  beforeEach(async function () {
    currentTime = await time.latest();
    // btcPrice = await fetchCoin('bitcoin')
    btcPrice = '9340.23'

    col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

    this.funds = await Funds.deployed();
    this.loans = await Loans.deployed();
    this.sales = await Sales.deployed();
    this.token = await ExampleCoin.deployed();

    this.cErc20 = await CErc20.deployed();
    this.cEther = await CEther.deployed();

    this.compound = await Compound.deployed();

    this.comptroller = await Comptroller.deployed();
  })

  describe('deposit', function() {
    it('should update cBalance based on compound exchange rate of cTokens', async function() {
      const fundParams = [
        toSecs({days: 366}),
        agent, 
        true
      ]

      this.fund = await this.funds.create.call(...fundParams)
      await this.funds.create(...fundParams)

      await this.token.approve(this.funds.address, toWei('200', 'ether'))

      const cErc20TokenBalanceBefore = await this.token.balanceOf.call(this.cErc20.address)
      const lenderTokenBalanceBefore = await this.token.balanceOf.call(lender)
      const cErc20BalBeforeDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)
      await this.funds.deposit(this.fund, toWei('100', 'ether'))
      const cErc20TokenBalanceAfter = await this.token.balanceOf.call(this.cErc20.address)
      const lenderTokenBalanceAfter = await this.token.balanceOf.call(lender)
      const cErc20BalAfterDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)

      const expectedCErc20TokenBalanceChange = toWei('100', 'ether')
      const actualCErc20TokenBalanceChange = BN(cErc20TokenBalanceAfter).minus(cErc20TokenBalanceBefore).toString()

      const expectedLenderTokenBalanceChange = toWei('100', 'ether')
      const actualLenderTokenBalanceChange = BN(lenderTokenBalanceBefore).minus(lenderTokenBalanceAfter).toString()

      assert.equal(expectedCErc20TokenBalanceChange, actualCErc20TokenBalanceChange)
      assert.equal(expectedLenderTokenBalanceChange, actualLenderTokenBalanceChange)

      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})

      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      assert.equal(0, borrow)

      await time.increase(toSecs({ hours: 1 }))

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()
      const cErc20BalBeforeDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)

      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const cErc20BalAfterDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)
      const { cBalance } = await this.funds.funds.call(this.fund)
      const actualExchangeRate = await this.cErc20.exchangeRateCurrent.call()
      const cErc20Balance = BN(cErc20BalAfterDeposit1).plus(cErc20BalAfterDeposit2).minus(cErc20BalBeforeDeposit1).minus(cErc20BalBeforeDeposit2)
      const balance = await this.funds.balance.call(this.fund)

      const expectedBalance = BN(cBalance).times(actualExchangeRate).dividedBy(WAD ** 2).toFixed(16)
      const actualBalance = BN(balance).dividedBy(WAD).toFixed(16)

      assert.equal(expectedBalance, actualBalance)
      assert.equal(cErc20Balance.toString(), cBalance.toString())
    })

    it('should update marketLiquidity to include interest gained from Compound', async function() {
      this.fund = await createCompoundEnabledFund(this, agent, lender, toWei('100', 'ether'))

      await this.token.approve(this.funds.address, toWei('200', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))
      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})
      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      assert.equal(borrow, 0)
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      
      await time.increase(toSecs({ hours: 1 }))

      const marketLiquidityBefore = await this.funds.marketLiquidity.call()
      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const CErc20Balance = await this.cErc20.balanceOf.call(this.funds.address)
      const cTokenMarketLiquidity = await this.funds.cTokenMarketLiquidity.call()

      const actualMarketLiquidity = BN(await this.funds.marketLiquidity.call()).dividedBy(WAD).toFixed(5)
      const expectedMarketLiquidity = BN(cTokenMarketLiquidity).times(exchangeRateCurrent).dividedBy(WAD ** 2).toFixed(5)
      const expectedMarketLiquidityFromCToken = BN(CErc20Balance).times(exchangeRateCurrent).dividedBy(WAD ** 2).toFixed(5)

      assert.equal(expectedMarketLiquidity, actualMarketLiquidity)
      assert.equal(expectedMarketLiquidityFromCToken, actualMarketLiquidity)
    })
  })

  describe('withdraw', function() {
    it('should update cBalance based on compound exchange rate of cTokens', async function() {
      const fundParams = [
        toSecs({days: 366}),
        agent, 
        true
      ]

      this.fund = await this.funds.create.call(...fundParams)
      await this.funds.create(...fundParams)

      await this.token.approve(this.funds.address, toWei('200', 'ether'))

      const cErc20BalBeforeDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)
      await this.funds.deposit(this.fund, toWei('100', 'ether'))
      const cErc20BalAfterDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)

      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})

      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      assert.equal(0, borrow)

      await time.increase(toSecs({ hours: 1 }))

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()
      const cErc20BalBeforeDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)

      await this.funds.withdraw(this.fund, toWei('80', 'ether'))

      const cErc20BalAfterDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)
      const { cBalance } = await this.funds.funds.call(this.fund)
      const actualExchangeRate = await this.cErc20.exchangeRateCurrent.call()
      const cErc20Balance = BN(cErc20BalAfterDeposit1).plus(cErc20BalAfterDeposit2).minus(cErc20BalBeforeDeposit1).minus(cErc20BalBeforeDeposit2)
      const balance = await this.funds.balance.call(this.fund)

      const expectedBalance = BN(cBalance).times(actualExchangeRate).dividedBy(WAD ** 2).toFixed(16)
      const actualBalance = BN(balance).dividedBy(WAD).toFixed(16)

      assert.equal(expectedBalance, actualBalance)
      assert.equal(cErc20Balance.toString(), cBalance.toString())
    })

    it('should update marketLiquidity to include interest gained from Compound', async function() {
      this.fund = await createCompoundEnabledFund(this, agent, lender, toWei('100', 'ether'))

      await this.token.approve(this.funds.address, toWei('200', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))
      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})
      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      assert.equal(borrow, 0)
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      
      await time.increase(toSecs({ hours: 1 }))

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

      await this.funds.withdraw(this.fund, toWei('80', 'ether'))

      const CErc20Balance = await this.cErc20.balanceOf.call(this.funds.address)
      const cTokenMarketLiquidity = await this.funds.cTokenMarketLiquidity.call()

      const actualMarketLiquidity = BN(await this.funds.marketLiquidity.call()).dividedBy(WAD).toFixed(5)
      const expectedMarketLiquidity = BN(cTokenMarketLiquidity).times(exchangeRateCurrent).dividedBy(WAD ** 2).toFixed(5)
      const expectedMarketLiquidityFromCToken = BN(CErc20Balance).times(exchangeRateCurrent).dividedBy(WAD ** 2).toFixed(5)

      assert.equal(expectedMarketLiquidity, actualMarketLiquidity)
      assert.equal(expectedMarketLiquidityFromCToken, actualMarketLiquidity)
    })
  })

  describe('request', function() {
    it('should update cBalance based on compound exchange rate of cTokens', async function() {
      const fundParams = [
        toSecs({days: 366}),
        agent, 
        true
      ]

      this.fund = await this.funds.create.call(...fundParams)
      await this.funds.create(...fundParams)

      await this.token.approve(this.funds.address, toWei('200', 'ether'))

      const cErc20BalBeforeDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)
      await this.funds.deposit(this.fund, toWei('80', 'ether'))
      const cErc20BalAfterDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)

      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})

      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      assert.equal(0, borrow)

      await time.increase(toSecs({ hours: 1 }))

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()
      const cErc20BalBeforeDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)

      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(lendpubk))

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

      const cErc20BalAfterDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)
      const { cBalance } = await this.funds.funds.call(this.fund)
      const actualExchangeRate = await this.cErc20.exchangeRateCurrent.call()
      const cErc20Balance = BN(cErc20BalAfterDeposit1).plus(cErc20BalAfterDeposit2).minus(cErc20BalBeforeDeposit1).minus(cErc20BalBeforeDeposit2)
      const balance = await this.funds.balance.call(this.fund)

      const expectedBalance = BN(cBalance).times(actualExchangeRate).dividedBy(WAD ** 2).toFixed(16)
      const actualBalance = BN(balance).dividedBy(WAD).toFixed(16)

      assert.equal(expectedBalance, actualBalance)
      assert.equal(cErc20Balance.toString(), cBalance.toString())
    })

    it('should update marketLiquidity to include interest gained from Compound', async function() {
      this.fund = await createCompoundEnabledFund(this, agent, lender, toWei('100', 'ether'))

      await this.token.approve(this.funds.address, toWei('200', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))
      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})
      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      assert.equal(borrow, 0)
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      
      await time.increase(toSecs({ hours: 1 }))

      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate agent secret hashes
      await this.funds.generate(agentSechs, { from: agent })

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(lendpubk))

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

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

      const CErc20Balance = await this.cErc20.balanceOf.call(this.funds.address)
      const cTokenMarketLiquidity = await this.funds.cTokenMarketLiquidity.call()

      const expectedMarketLiquidity = BN(cTokenMarketLiquidity).times(exchangeRateCurrent).dividedBy(WAD ** 2).toFixed(5)
      const expectedMarketLiquidityFromCToken = BN(CErc20Balance).times(exchangeRateCurrent).dividedBy(WAD ** 2).toFixed(5)

      const actualMarketLiquidity = BN(await this.funds.marketLiquidity.call()).dividedBy(WAD).toFixed(5)

      assert.equal(expectedMarketLiquidity, actualMarketLiquidity)
      assert.equal(expectedMarketLiquidityFromCToken, actualMarketLiquidity)
    })
  })

  describe('enableCompound', function() {
    it('should properly convert DAI to cDAI at the current exchangeRate and update token and cToken balances', async function() {
      this.fund  = await createCompoundDisabledFund(this, agent, lender, toWei('100', 'ether'))
      this.fund2 = await createCompoundEnabledFund(this, agent, lender2, toWei('100', 'ether'))

      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})
      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      assert.equal(borrow, 0)
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      
      await time.increase(toSecs({ hours: 1 }))

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledBefore, cBalance: cBalanceBefore, balance: balanceBefore } = await this.funds.funds.call(this.fund)
      assert.equal(false, isCompoundEnabledBefore)
      assert.equal(0, cBalanceBefore)

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

      await this.funds.enableCompound(this.fund)

      const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledAfter, cBalance: cBalanceAfter, balance: balanceAfter } = await this.funds.funds.call(this.fund)
      assert.equal(true, isCompoundEnabledAfter)
      assert.equal(0, balanceAfter)

      const expectedCBalanceAfter = BN(balanceBefore).times(WAD).dividedBy(exchangeRateCurrent).dividedBy(COM).toFixed(4)
      const expectedCBalanceChange = BN(cErc20BalanceAfter).minus(cErc20BalanceBefore).dividedBy(COM).toFixed(4)
      const expectedBalanceChange = BN(tokenBalanceBefore).minus(tokenBalanceAfter).dividedBy(WAD).toFixed(18)

      const actualCBalanceAfter = BN(cBalanceAfter).dividedBy(COM).toFixed(4)
      const actualBalanceBefore = BN(balanceBefore).dividedBy(WAD).toFixed(18)

      assert.equal(expectedCBalanceAfter, actualCBalanceAfter)
      assert.equal(expectedCBalanceChange, actualCBalanceAfter)
      assert.equal(expectedBalanceChange, actualBalanceBefore)
    })

    it('should transfer tokenMarketLiquidity to cTokenMarketLiquidity at DAI to cDAI exchangeRate', async function() {
      this.fund  = await createCompoundDisabledFund(this, agent, lender, toWei('100', 'ether'))
      this.fund2 = await createCompoundEnabledFund(this, agent, lender2, toWei('100', 'ether'))

      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})
      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      assert.equal(borrow, 0)
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      
      await time.increase(toSecs({ hours: 1 }))

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledBefore, cBalance: cBalanceBefore, balance: balanceBefore } = await this.funds.funds.call(this.fund)
      assert.equal(false, isCompoundEnabledBefore)
      assert.equal(0, cBalanceBefore)

      const tokenMarketLiquidityBefore = await this.funds.tokenMarketLiquidity.call()
      const cTokenMarketLiquidityBefore = await this.funds.cTokenMarketLiquidity.call()

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

      await this.funds.enableCompound(this.fund)

      const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledAfter, cBalance: cBalanceAfter, balance: balanceAfter } = await this.funds.funds.call(this.fund)
      assert.equal(true, isCompoundEnabledAfter)
      assert.equal(0, balanceAfter)

      const expectedBalanceChange = BN(tokenBalanceBefore).minus(tokenBalanceAfter)
      const expectedCBalanceChange = BN(cErc20BalanceAfter).minus(cErc20BalanceBefore)

      const tokenMarketLiquidityAfter = await this.funds.tokenMarketLiquidity.call()
      const cTokenMarketLiquidityAfter = await this.funds.cTokenMarketLiquidity.call()

      const expectedTokenMarketLiquidity = BN(tokenMarketLiquidityBefore).minus(expectedBalanceChange).dividedBy(WAD).toFixed(18)
      const expectedCTokenMarketLiquidity = BN(cTokenMarketLiquidityBefore).plus(expectedCBalanceChange).dividedBy(COM).toFixed(8)

      const actualTokenMarketLiquidity = BN(tokenMarketLiquidityAfter).dividedBy(WAD).toFixed(18)
      const actualCTokenMarketLiquidity = BN(cTokenMarketLiquidityAfter).dividedBy(COM).toFixed(8)

      assert.equal(expectedTokenMarketLiquidity, actualTokenMarketLiquidity)
      assert.equal(expectedCTokenMarketLiquidity, actualCTokenMarketLiquidity)
    })
  })

  describe('disableCompound', function() {
    it('should properly convert cDAI to DAI at the current exchangeRate and update token and cToken balances', async function() {
      this.fund  = await createCompoundEnabledFund(this, agent, lender, toWei('100', 'ether'))
      this.fund2 = await createCompoundEnabledFund(this, agent, lender2, toWei('100', 'ether'))

      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})
      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      assert.equal(borrow, 0)
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      
      await time.increase(toSecs({ hours: 1 }))

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledBefore, cBalance: cBalanceBefore, balance: balanceBefore } = await this.funds.funds.call(this.fund)
      assert.equal(true, isCompoundEnabledBefore)
      assert.equal(0, balanceBefore)

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

      await this.funds.disableCompound(this.fund)

      const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledAfter, cBalance: cBalanceAfter, balance: balanceAfter } = await this.funds.funds.call(this.fund)
      assert.equal(false, isCompoundEnabledAfter)
      assert.equal(0, cBalanceAfter)

      const expectedBalanceAfter = BN(cBalanceBefore).times(exchangeRateCurrent).dividedBy(WAD ** 2).toFixed(5)
      const expectedBalanceChange = BN(tokenBalanceAfter).minus(tokenBalanceBefore).dividedBy(WAD).toFixed(5)
      const expectedCBalanceChange = BN(cErc20BalanceBefore).minus(cErc20BalanceAfter).dividedBy(COM).toFixed(8)

      const actualBalanceAfter = BN(balanceAfter).dividedBy(WAD).toFixed(5)
      const actualCBalanceBefore = BN(cBalanceBefore).dividedBy(COM).toFixed(8)

      assert.equal(expectedBalanceAfter, actualBalanceAfter)
      assert.equal(expectedBalanceChange, actualBalanceAfter)
      assert.equal(expectedCBalanceChange, actualCBalanceBefore)
    })

    it('should transfer cTokenMarketLiquidity to tokenMarketLiquidity at cDAI to DAI exchangeRate', async function() {
      this.fund  = await createCompoundEnabledFund(this, agent, lender, toWei('100', 'ether'))
      this.fund2 = await createCompoundEnabledFund(this, agent, lender2, toWei('100', 'ether'))

      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('1', 'ether')})
      await this.cEther.mint({ from: agent, value: toWei('1', 'ether')})

      const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: agent })
      assert.equal(enterCEtherMarket, 0)
      await this.comptroller.enterMarkets([this.cEther.address], { from: agent })

      const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: agent })
      assert.equal(enterCErc20Market, 0)
      await this.comptroller.enterMarkets([this.cErc20.address], { from: agent })

      const borrow = await this.cErc20.borrow.call(toWei('10', 'ether'), { from: agent })
      assert.equal(borrow, 0)
      await this.cErc20.borrow(toWei('10', 'ether'), { from: agent })
      
      await time.increase(toSecs({ hours: 1 }))

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledBefore, cBalance: cBalanceBefore, balance: balanceBefore } = await this.funds.funds.call(this.fund)
      assert.equal(true, isCompoundEnabledBefore)
      assert.equal(0, balanceBefore)

      const tokenMarketLiquidityBefore = await this.funds.tokenMarketLiquidity.call()
      const cTokenMarketLiquidityBefore = await this.funds.cTokenMarketLiquidity.call()

      const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

      await this.funds.disableCompound(this.fund)

      const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
      const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
      const { compoundEnabled: isCompoundEnabledAfter, cBalance: cBalanceAfter, balance: balanceAfter } = await this.funds.funds.call(this.fund)
      assert.equal(false, isCompoundEnabledAfter)
      assert.equal(0, cBalanceAfter)

      const expectedBalanceChange = BN(tokenBalanceAfter).minus(tokenBalanceBefore)
      const expectedCBalanceChange = BN(cErc20BalanceBefore).minus(cErc20BalanceAfter)

      const tokenMarketLiquidityAfter = await this.funds.tokenMarketLiquidity.call()
      const cTokenMarketLiquidityAfter = await this.funds.cTokenMarketLiquidity.call()

      const expectedTokenMarketLiquidity = BN(tokenMarketLiquidityBefore).plus(expectedBalanceChange).dividedBy(WAD).toFixed(17)
      const expectedCTokenMarketLiquidity = BN(cTokenMarketLiquidityBefore).minus(expectedCBalanceChange).dividedBy(COM).toFixed(8)

      const actualTokenMarketLiquidity = BN(tokenMarketLiquidityAfter).dividedBy(WAD).toFixed(17)
      const actualCTokenMarketLiquidity = BN(cTokenMarketLiquidityAfter).dividedBy(COM).toFixed(8)

      assert.equal(expectedTokenMarketLiquidity, actualTokenMarketLiquidity)
      assert.equal(expectedCTokenMarketLiquidity, actualCTokenMarketLiquidity)
    })
  })

  describe('setCompound', function() {
    it('should fail if called twice', async function() {
      await expectRevert(this.funds.setCompound(this.cErc20.address, this.comptroller.address), 'VM Exception while processing transaction: revert')
    })
  })
})
