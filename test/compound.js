const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const _ = require('lodash')

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber: BN } = require('bignumber.js');
const axios         = require('axios');

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
const USDCInterestRateModel = artifacts.require('./USDCInterestRateModel.sol')
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Med = artifacts.require('./MedianizerExample.sol');

const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');
const Comptroller = artifacts.require('./Comptroller.sol')
const PriceOracleProxy = artifacts.require('./PriceOracleProxy.sol')
const PriceOracle = artifacts.require('./_PriceOracle.sol')

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32, toBaseUnit } = utils;
const { toWei, fromWei } = web3.utils;

const BTC_TO_SAT = 10**8

const COM = 10 ** 8
const SAT = 10 ** 8
const COL = 10 ** 8
const WAD = 10 ** 18
const RAY = 10 ** 27

BN.config({ ROUNDING_MODE: BN.ROUND_DOWN })

const stablecoins = [ { name: 'DAI', unit: 'ether' }, { name: 'USDC', unit: 'mwei' } ]

async function getContracts(stablecoin, accounts) {
  if (stablecoin == 'DAI') {
    const funds = await Funds.deployed();
    const loans = await Loans.deployed();
    const sales = await Sales.deployed();
    const token = await ExampleCoin.deployed();
    const med   = await Med.deployed();
    const cErc20 = await CErc20.deployed();
    const cEther = await CEther.deployed();
    const comptroller = await Comptroller.deployed();

    return { funds, loans, sales, token, med, cErc20, cEther, comptroller }
  } else if (stablecoin == 'USDC') {
    const med = await Med.deployed()
    const token = await ExampleUsdcCoin.deployed()
    const comptroller = await Comptroller.deployed()
    const assetsIn = await comptroller.getAssetsIn.call(accounts[0])
    const cErc20 = await CErc20.at(assetsIn[1])
    const cEther = await CEther.deployed()

    const funds = await Funds.new(token.address, '6')
    await funds.setCompound(cErc20.address, comptroller.address)

    const loans = await Loans.new(funds.address, med.address, token.address, '6')
    const sales = await Sales.new(loans.address, med.address, token.address)

    await funds.setLoans(loans.address)
    await loans.setSales(sales.address)

    return { funds, loans, sales, token, med, cErc20, cEther, comptroller }
  }
}

async function createFund(_this, arbiter, account, amount, compoundEnabled) {
  const fundParams = [
    toSecs({days: 366}),
    BN(2).pow(256).minus(1).toFixed(),
    arbiter, 
    compoundEnabled,
    0
  ]

  const fund = await _this.funds.create.call(...fundParams, { from: account })
  await _this.funds.create(...fundParams, { from: account })

  await _this.token.transfer(account, amount)

  await _this.token.approve(_this.funds.address, amount, { from: account })
  await _this.funds.deposit(fund, amount, { from: account })

  return fund
}

async function createCompoundEnabledFund(_this, arbiter, account, amount) {
  return createFund(_this, arbiter, account, amount, true)
}

async function createCompoundDisabledFund(_this, arbiter, account, amount) {
  return createFund(_this, arbiter, account, amount, false)
}

stablecoins.forEach((stablecoin) => {
  const { name, unit } = stablecoin

  contract(`${name} Compound`, accounts => {
    const lender = accounts[0]
    const borrower = accounts[1]
    const arbiter = accounts[2]
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
    
    const borpubk = '02b4c50d2b6bdc9f45b9d705eeca37e811dfdeb7365bf42f82222f7a4a89868703'
    const lendpubk = '03dc23d80e1cf6feadf464406e299ac7fec9ea13c51dfd9abd970758bf33d89bb6'
    const arbiterpubk = '02688ce4b6ca876d3e0451e6059c34df4325745c1f7299ebc108812032106eaa32'

    let borSecs = []
    let borSechs = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs.push(ensure0x(sec))
      borSechs.push(ensure0x(sha256(sec)))
    }

    let arbiterSecs = []
    let arbiterSechs = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      arbiterSecs.push(ensure0x(sec))
      arbiterSechs.push(ensure0x(sha256(sec)))
    }

    beforeEach(async function () {
      currentTime = await time.latest();

      btcPrice = '9340.23'

      col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      const { funds, loans, sales, token, med, cErc20, cEther, comptroller } = await getContracts(name, accounts)

      this.funds = funds
      this.loans = loans
      this.sales = sales
      this.token = token
      this.med = med
      this.cErc20 = cErc20
      this.cEther = cEther
      this.comptroller = comptroller
    })

    describe('deposit', function() {
      it('should update cBalance based on compound exchange rate of cTokens', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BN(2).pow(256).minus(1).toFixed(),
          arbiter, 
          true,
          0
        ]

        this.fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await this.token.approve(this.funds.address, toWei('200', unit))

        const cErc20TokenBalanceBefore = await this.token.balanceOf.call(this.cErc20.address)
        const lenderTokenBalanceBefore = await this.token.balanceOf.call(lender)
        const cErc20BalBeforeDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)
        await this.funds.deposit(this.fund, toWei('100', unit))

        const cErc20TokenBalanceAfter = await this.token.balanceOf.call(this.cErc20.address)
        const lenderTokenBalanceAfter = await this.token.balanceOf.call(lender)
        const cErc20BalAfterDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)

        const testCBalance = await this.cErc20.balanceOf.call(lender)

        const expectedCErc20TokenBalanceChange = toWei('100', unit)
        const actualCErc20TokenBalanceChange = BN(cErc20TokenBalanceAfter).minus(cErc20TokenBalanceBefore).toString()

        const expectedLenderTokenBalanceChange = toWei('100', unit)
        const actualLenderTokenBalanceChange = BN(lenderTokenBalanceBefore).minus(lenderTokenBalanceAfter).toString()

        assert.equal(expectedCErc20TokenBalanceChange, actualCErc20TokenBalanceChange)
        assert.equal(expectedLenderTokenBalanceChange, actualLenderTokenBalanceChange)

        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})

        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        assert.equal(0, borrow)

        await time.increase(toSecs({ hours: 1 }))

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()
        const cErc20BalBeforeDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)

        await this.funds.deposit(this.fund, toWei('100', unit))

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
        this.fund = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))

        await this.token.approve(this.funds.address, toWei('200', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))
        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})
        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        assert.equal(borrow, 0)
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        
        await time.increase(toSecs({ hours: 1 }))

        const marketLiquidityBefore = await this.funds.marketLiquidity.call()
        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

        await this.funds.deposit(this.fund, toWei('100', unit))

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
          BN(2).pow(256).minus(1).toFixed(),
          arbiter, 
          true,
          0
        ]

        this.fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await this.token.approve(this.funds.address, toWei('200', unit))

        const cErc20BalBeforeDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)
        await this.funds.deposit(this.fund, toWei('100', unit))
        const cErc20BalAfterDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)

        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})

        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        assert.equal(0, borrow)

        await time.increase(toSecs({ hours: 1 }))

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()
        const cErc20BalBeforeDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)

        await this.funds.withdraw(this.fund, toWei('80', unit))

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
        this.fund = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))

        await this.token.approve(this.funds.address, toWei('200', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))
        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})
        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        assert.equal(borrow, 0)
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        
        await time.increase(toSecs({ hours: 1 }))

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

        await this.funds.withdraw(this.fund, toWei('80', unit))

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
          BN(2).pow(256).minus(1).toFixed(),
          arbiter, 
          true,
          0
        ]

        this.fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await this.token.approve(this.funds.address, toWei('200', unit))

        const cErc20BalBeforeDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)
        await this.funds.deposit(this.fund, toWei('80', unit))
        const cErc20BalAfterDeposit1 = await this.cErc20.balanceOf.call(this.funds.address)

        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})

        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        assert.equal(0, borrow)

        await time.increase(toSecs({ hours: 1 }))

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()
        const cErc20BalBeforeDeposit2 = await this.cErc20.balanceOf.call(this.funds.address)

        // Generate lender secret hashes
        await this.funds.generate(lendSechs)

        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Set Lender PubKey
        await this.funds.setPubKey(ensure0x(arbiterpubk), { from: arbiter })

        const loanParams = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 2}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan = await this.funds.request.call(...loanParams)
        await this.funds.request(...loanParams)

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
        this.fund = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))

        await this.token.approve(this.funds.address, toWei('200', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))
        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})
        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        assert.equal(borrow, 0)
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        
        await time.increase(toSecs({ hours: 1 }))

        // Generate lender secret hashes
        await this.funds.generate(lendSechs)

        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Set Lender PubKey
        await this.funds.setPubKey(ensure0x(lendpubk))

        const loanParams = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 2}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan = await this.funds.request.call(...loanParams)
        await this.funds.request(...loanParams)

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
        this.fund  = await createCompoundDisabledFund(this, arbiter, lender, toWei('100', unit))
        this.fund2 = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))

        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})
        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        assert.equal(borrow, 0)
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        
        await time.increase(toSecs({ hours: 1 }))

        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceBefore, cBalance: cBalanceBefore } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledBefore } = await this.funds.bools.call(this.fund)
        assert.equal(false, isCompoundEnabledBefore)
        assert.equal(0, cBalanceBefore)

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

        await this.funds.enableCompound(this.fund)

        const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceAfter, cBalance: cBalanceAfter } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledAfter } = await this.funds.bools.call(this.fund)
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
        this.fund  = await createCompoundDisabledFund(this, arbiter, lender, toWei('100', unit))
        this.fund2 = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))

        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})
        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        assert.equal(borrow, 0)
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        
        await time.increase(toSecs({ hours: 1 }))

        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceBefore, cBalance: cBalanceBefore } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledBefore } = await this.funds.bools.call(this.fund)
        assert.equal(false, isCompoundEnabledBefore)
        assert.equal(0, cBalanceBefore)

        const tokenMarketLiquidityBefore = await this.funds.tokenMarketLiquidity.call()
        const cTokenMarketLiquidityBefore = await this.funds.cTokenMarketLiquidity.call()

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

        await this.funds.enableCompound(this.fund)

        const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceAfter, cBalance: cBalanceAfter } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledAfter } = await this.funds.bools.call(this.fund)
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
        this.fund  = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))
        this.fund2 = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))

        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})
        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        assert.equal(borrow, 0)
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        
        await time.increase(toSecs({ hours: 1 }))

        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceBefore, cBalance: cBalanceBefore } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledBefore } = await this.funds.bools.call(this.fund)
        assert.equal(true, isCompoundEnabledBefore)
        assert.equal(0, balanceBefore)

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

        await this.funds.disableCompound(this.fund)

        const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceAfter, cBalance: cBalanceAfter } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledAfter } = await this.funds.bools.call(this.fund)
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
        this.fund  = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))
        this.fund2 = await createCompoundEnabledFund(this, arbiter, lender, toWei('100', unit))

        await web3.eth.sendTransaction({ to: arbiter, from: lender, value: toWei('1', 'ether')})
        await this.cEther.mint({ from: arbiter, value: toWei('1', 'ether')})

        const enterCEtherMarket = await this.comptroller.enterMarkets.call([this.cEther.address], { from: arbiter })
        assert.equal(enterCEtherMarket, 0)
        await this.comptroller.enterMarkets([this.cEther.address], { from: arbiter })

        const enterCErc20Market = await this.comptroller.enterMarkets.call([this.cErc20.address], { from: arbiter })
        assert.equal(enterCErc20Market, 0)
        await this.comptroller.enterMarkets([this.cErc20.address], { from: arbiter })

        const borrow = await this.cErc20.borrow.call(toWei('10', unit), { from: arbiter })
        assert.equal(borrow, 0)
        await this.cErc20.borrow(toWei('10', unit), { from: arbiter })
        
        await time.increase(toSecs({ hours: 1 }))

        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const tokenBalanceBefore = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceBefore = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceBefore, cBalance: cBalanceBefore } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledBefore } = await this.funds.bools.call(this.fund)
        assert.equal(true, isCompoundEnabledBefore)
        assert.equal(0, balanceBefore)

        const tokenMarketLiquidityBefore = await this.funds.tokenMarketLiquidity.call()
        const cTokenMarketLiquidityBefore = await this.funds.cTokenMarketLiquidity.call()

        const exchangeRateCurrent = await this.cErc20.exchangeRateCurrent.call()

        await this.funds.disableCompound(this.fund)

        const tokenBalanceAfter = await this.token.balanceOf.call(this.funds.address)
        const cErc20BalanceAfter = await this.cErc20.balanceOf.call(this.funds.address)
        const { balance: balanceAfter, cBalance: cBalanceAfter } = await this.funds.funds.call(this.fund)
        const { compoundEnabled: isCompoundEnabledAfter } = await this.funds.bools.call(this.fund)
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
})
