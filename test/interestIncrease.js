const { bitcoin } = require('./helpers/collateral/common.js')

const { time } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
const DAIInterestRateModel = artifacts.require('./DAIInterestRateModel')
const USDCInterestRateModel = artifacts.require('./USDCInterestRateModel.sol')
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Collateral = artifacts.require("./Collateral.sol");
const ISPVRequestManager = artifacts.require('./ISPVRequestManager.sol');
const P2WSH  = artifacts.require('./P2WSH.sol');
const Med = artifacts.require('./MedianizerExample.sol');

const CErc20 = artifacts.require('./CErc20.sol');
const Comptroller = artifacts.require('./Comptroller.sol')

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const BTC_TO_SAT = 10**8
const YEAR_IN_SECONDS = BigNumber(31536000)

console.info = () => {} // Silence the Deprecation Warning

const mockDateNow = () => {
  let current = Date.now()

  return () => {
    current += 5000;
    return current;
  }
}

global.Date.now = mockDateNow();

const stablecoins = [ { name: 'DAI', unit: 'ether' }, { name: 'USDC', unit: 'mwei' } ]

async function getContracts(stablecoin) {
  if (stablecoin == 'DAI') {
    const med = await Med.deployed()
    const token = await ExampleCoin.deployed()
    const comptroller = await Comptroller.deployed()
    const daiInterestRateModel = await DAIInterestRateModel.deployed()
    const cDai  = await CErc20.new(token.address, comptroller.address, daiInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Dai', 'cDAI', '8')

    await comptroller._supportMarket(cDai.address)

    const funds = await Funds.new(token.address, '18')
    await funds.setCompound(cDai.address, comptroller.address)

    const loans = await Loans.new(funds.address, med.address, token.address, '18')
    const sales = await Sales.new(loans.address, funds.address, med.address, token.address)

    await funds.setLoans(loans.address)
    await loans.setSales(sales.address)

    const p2wsh = await P2WSH.new(loans.address)

    const onDemandSpv = await ISPVRequestManager.deployed()

    const collateral = await Collateral.new(loans.address)

    await collateral.setP2WSH(p2wsh.address)
    await collateral.setOnDemandSpv(onDemandSpv.address)

    await loans.setCollateral(collateral.address)

    return { funds, loans, sales, token, med }
  } else if (stablecoin == 'USDC') {
    const med = await Med.deployed()
    const token = await ExampleUsdcCoin.deployed()
    const comptroller = await Comptroller.deployed()
    const usdcInterestRateModel = await USDCInterestRateModel.deployed()
    const cUsdc = await CErc20.new(token.address, comptroller.address, usdcInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Usdc', 'cUSDC', '8')

    await comptroller._supportMarket(cUsdc.address)

    const funds = await Funds.new(token.address, '6')
    await funds.setCompound(cUsdc.address, comptroller.address)

    const loans = await Loans.new(funds.address, med.address, token.address, '6')
    const sales = await Sales.new(loans.address, funds.address, med.address, token.address)

    await funds.setLoans(loans.address)
    await loans.setSales(sales.address)

    const p2wsh = await P2WSH.new(loans.address)

    const onDemandSpv = await ISPVRequestManager.deployed()

    const collateral = await Collateral.new(loans.address)

    await collateral.setP2WSH(p2wsh.address)
    await collateral.setOnDemandSpv(onDemandSpv.address)

    await loans.setCollateral(collateral.address)

    return { funds, loans, sales, token, med }
  }
}

async function getCurrentTime() {
  const latestBlockNumber = await web3.eth.getBlockNumber()
  const latestBlockTimestamp = (await web3.eth.getBlock(latestBlockNumber)).timestamp
  return latestBlockTimestamp
}

async function increaseTime(seconds) {
  await time.increase(seconds)

  const currentTime = await getCurrentTime()

  await bitcoin.client.getMethod('jsonrpc')('setmocktime', currentTime)

  await bitcoin.client.chain.generateBlock(10)
}

stablecoins.forEach((stablecoin) => {
  const { name, unit } = stablecoin

  contract(`${name} Global Interest Rate Increase`, accounts => {
    const lender     = accounts[0]
    const borrower   = accounts[1]
    const arbiter    = accounts[2]
    const liquidator = accounts[3]
    const lender2    = accounts[4]

    let currentTime
    let btcPrice

    const loanReq = 50; // 50 DAI
    const loanReq2 = 300; // 300 DAI
    const loanReq3 = 400; // 400 DAI
    const loanReq4 = 3000; // 3000 DAI
    const loanRat = 2;   // Collateralization ratio of 200%
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

    let borSecs2 = []
    let borSechs2 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs2.push(ensure0x(sec))
      borSechs2.push(ensure0x(sha256(sec)))
    }

    let borSecs3 = []
    let borSechs3 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs3.push(ensure0x(sec))
      borSechs3.push(ensure0x(sha256(sec)))
    }

    let borSecs4 = []
    let borSechs4 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs4.push(ensure0x(sec))
      borSechs4.push(ensure0x(sha256(sec)))
    }

    let borSecs5 = []
    let borSechs5 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs5.push(ensure0x(sec))
      borSechs5.push(ensure0x(sha256(sec)))
    }

    let borSecs6 = []
    let borSechs6 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs6.push(ensure0x(sec))
      borSechs6.push(ensure0x(sha256(sec)))
    }

    let borSecs7 = []
    let borSechs7 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs7.push(ensure0x(sec))
      borSechs7.push(ensure0x(sha256(sec)))
    }

    let borSecs8 = []
    let borSechs8 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs8.push(ensure0x(sec))
      borSechs8.push(ensure0x(sha256(sec)))
    }

    let borSecs9 = []
    let borSechs9 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs9.push(ensure0x(sec))
      borSechs9.push(ensure0x(sha256(sec)))
    }

    let borSecs10 = []
    let borSechs10 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs10.push(ensure0x(sec))
      borSechs10.push(ensure0x(sha256(sec)))
    }

    let borSecs11 = []
    let borSechs11 = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      borSecs11.push(ensure0x(sec))
      borSechs11.push(ensure0x(sha256(sec)))
    }

    let arbiterSecs = []
    let arbiterSechs = []
    for (let i = 0; i < 44; i++) {
      let sec = sha256(Math.random().toString())
      arbiterSecs.push(ensure0x(sec))
      arbiterSechs.push(ensure0x(sha256(sec)))
    }

    let liquidatorSecs = []
    let liquidatorSechs = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      liquidatorSecs.push(ensure0x(sec))
      liquidatorSechs.push(ensure0x(sha256(sec)))
    }

    const liquidatorpbkh = '7e18e6193db71abb00b70b102677675c27115871'

    beforeEach(async function () {
      currentTime = await time.latest();

      const blockHeight = await bitcoin.client.chain.getBlockHeight()
      if (blockHeight < 101) {
        await bitcoin.client.chain.generateBlock(101)
      } else {
        // Bitcoin regtest node can only generate blocks if within 2 hours
        const latestBlockHash = await bitcoin.client.getMethod('jsonrpc')('getblockhash', blockHeight)
        const latestBlock = await bitcoin.client.getMethod('jsonrpc')('getblock', latestBlockHash)

        let btcTime = latestBlock.time
        const ethTime = await getCurrentTime()

        await bitcoin.client.getMethod('jsonrpc')('setmocktime', btcTime)
        await bitcoin.client.chain.generateBlock(6)

        if (btcTime > ethTime) {
          await time.increase(btcTime - ethTime)
        }

        while (ethTime > btcTime && (ethTime - btcTime) >= toSecs({ hours: 2 })) {
          await bitcoin.client.getMethod('jsonrpc')('setmocktime', btcTime)
          await bitcoin.client.chain.generateBlock(6)
          btcTime += toSecs({ hours: 1, minutes: 59 })
        }
      }

      btcPrice = '9340.23'

      col = Math.round(((loanReq4 * loanRat) / btcPrice) * BTC_TO_SAT)

      const { funds, loans, sales, token, med } = await getContracts(name)

      this.funds = funds
      this.loans = loans
      this.sales = sales
      this.token = token
      this.med = med

      this.med.poke(numToBytes32(toWei(btcPrice, 'ether')))

      const fundParams = [
        toSecs({days: 366}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiter,
        false,
        0
      ]

      this.fund = await this.funds.create.call(...fundParams)
      await this.funds.create(...fundParams)

      // Generate lender secret hashes
      await this.funds.generate(lendSechs)

      // Generate arbiter secret hashes
      await this.funds.generate(arbiterSechs, { from: arbiter })

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(lendpubk))
      await this.funds.setPubKey(ensure0x(lendpubk), { from: lender2 })
      await this.funds.setPubKey(ensure0x(arbiterpubk), { from: arbiter })

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('13000', unit))
      await this.funds.deposit(this.fund, toWei('400', unit))

      await this.token.transfer(lender2, toWei('100', unit))
      await this.token.approve(this.funds.address, toWei('100', unit), { from: lender2 })
    })

    describe('global interest rate', function() {
      it('should increase global interest rate after a day if utilization ratio increases', async function() {
        await increaseTime(toSecs({ days: 30, minutes: 1 }))

        const loanIndex = await this.loans.loanIndex.call()
        for (let i = 1; i <= loanIndex; i++) {
          const loan = numToBytes32(i)
          console.log('loan', loan)
          const { off, sale, withdrawn, paid } = await this.loans.bools.call(loan)
          if (withdrawn === false) {
            console.log('not withdrawn')
            await this.loans.cancel(loan)
          } else if (paid === true && off === false && sale === false) {
            console.log('refund to continue')
            await this.loans.refund(loan, { from: borrower })
          } else if (off === false && sale === false) {
            console.log('liquidate to continue')
            await this.med.poke(numToBytes32(toWei((btcPrice * 0.3).toString(), 'ether')))

            await this.token.transfer(liquidator, toWei('800', unit))
            await this.token.approve(this.loans.address, toWei('800', unit), { from: liquidator })

            await this.loans.liquidate(loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })
          }
        }

        await increaseTime(toSecs({ days: 2 }))

        await this.funds.deposit(this.fund, toWei('1', unit))

        await this.med.poke(numToBytes32(toWei((btcPrice * 1.2).toString(), 'ether')))

        const globalInterestRate = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate', fromWei(globalInterestRate, 'gether'))

        const globalInterestRateNumerator = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator', fromWei(globalInterestRateNumerator, 'gether'))

        const utilizationRatio = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio', fromWei(utilizationRatio, 'gether'))
        console.info('====================================')

        assert.equal(fromWei(utilizationRatio, 'gether'), 0)

        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan = await this.funds.request.call(...loanParams)
        await this.funds.request(...loanParams)

        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        const globalInterestRate2 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate', fromWei(globalInterestRate2, 'gether'))

        const globalInterestRateNumerator2 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator2', fromWei(globalInterestRateNumerator2, 'gether'))

        const utilizationRatio2 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio2', fromWei(utilizationRatio2, 'gether'))

        const interestRate2 = Math.pow(fromWei(globalInterestRate2, 'gether'), 31536000)
        console.info('~interestRate2', interestRate2)
        console.info('====================================')


        assert.equal(BigNumber(fromWei(globalInterestRate2, 'gether')).gte(BigNumber(rateToSec('10.99999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate2, 'gether')).lt(BigNumber(rateToSec('11.1'))), true)


        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams2 = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs2, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan2 = await this.funds.request.call(...loanParams2)
        await this.funds.request(...loanParams2)


        const globalInterestRate3 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate3', fromWei(globalInterestRate3, 'gether'))

        const globalInterestRateNumerator3 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator3', fromWei(globalInterestRateNumerator3, 'gether'))

        const utilizationRatio3 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio3', fromWei(utilizationRatio3, 'gether'))

        const interestRate3 = Math.pow(fromWei(globalInterestRate3, 'gether'), 31536000)
        console.info('~interestRate3', interestRate3)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate3, 'gether')).gte(BigNumber(rateToSec('12'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate3, 'gether')).lt(BigNumber(rateToSec('12.1'))), true)

        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams3 = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs3, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan3 = await this.funds.request.call(...loanParams3)
        await this.funds.request(...loanParams3)


        const globalInterestRate4 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate4', fromWei(globalInterestRate4, 'gether'))

        const globalInterestRateNumerator4 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator4', fromWei(globalInterestRateNumerator4, 'gether'))

        const utilizationRatio4 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio4', fromWei(utilizationRatio4, 'gether'))

        const interestRate4 = Math.pow(fromWei(globalInterestRate4, 'gether'), 31536000)
        console.info('~interestRate4', interestRate4)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate4, 'gether')).gte(BigNumber(rateToSec('13'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate4, 'gether')).lt(BigNumber(rateToSec('13.1'))), true)

        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams4 = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs4, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan3 = await this.funds.request.call(...loanParams4)
        await this.funds.request(...loanParams4)


        const globalInterestRate5 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate5', fromWei(globalInterestRate5, 'gether'))

        const globalInterestRateNumerator5 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator5', fromWei(globalInterestRateNumerator5, 'gether'))

        const utilizationRatio5 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio5', fromWei(utilizationRatio5, 'gether'))

        const interestRate5 = Math.pow(fromWei(globalInterestRate5, 'gether'), 31536000)
        console.info('~interestRate5', interestRate5)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate5, 'gether')).gte(BigNumber(rateToSec('14'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate5, 'gether')).lt(BigNumber(rateToSec('14.1'))), true)


        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams5 = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs5, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan4 = await this.funds.request.call(...loanParams5)
        await this.funds.request(...loanParams5)


        const globalInterestRate6 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate6', fromWei(globalInterestRate6, 'gether'))

        const globalInterestRateNumerator6 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator6', fromWei(globalInterestRateNumerator6, 'gether'))

        const utilizationRatio6 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio6', fromWei(utilizationRatio6, 'gether'))

        const interestRate6 = Math.pow(fromWei(globalInterestRate6, 'gether'), 31536000)
        console.info('~interestRate6', interestRate6)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate6, 'gether')).gt(BigNumber(rateToSec('15'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate6, 'gether')).lt(BigNumber(rateToSec('15.2'))), true)

        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams6 = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs6, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan4 = await this.funds.request.call(...loanParams6)
        await this.funds.request(...loanParams6)


        const globalInterestRate7 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate7', fromWei(globalInterestRate7, 'gether'))

        const globalInterestRateNumerator7 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator7', fromWei(globalInterestRateNumerator7, 'gether'))

        const utilizationRatio7 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio7', fromWei(utilizationRatio7, 'gether'))

        const interestRate7 = Math.pow(fromWei(globalInterestRate7, 'gether'), 31536000)
        console.info('~interestRate7', interestRate7)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate7, 'gether')).gt(BigNumber(rateToSec('16'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate7, 'gether')).lt(BigNumber(rateToSec('16.2'))), true)


        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('1500', unit))
        await this.funds.deposit(this.fund, toWei('1500', unit))


        const globalInterestRate8 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate8', fromWei(globalInterestRate8, 'gether'))

        const globalInterestRateNumerator8 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator8', fromWei(globalInterestRateNumerator8, 'gether'))

        const utilizationRatio8 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio8', fromWei(utilizationRatio8, 'gether'))

        const interestRate8 = Math.pow(fromWei(globalInterestRate8, 'gether'), 31536000)
        console.info('~interestRate8', interestRate8)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate8, 'gether')).gt(BigNumber(rateToSec('15'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate8, 'gether')).lt(BigNumber(rateToSec('15.1'))), true)

        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams7 = [
          this.fund,
          borrower,
          toWei(loanReq2.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs7, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan4 = await this.funds.request.call(...loanParams7)
        await this.funds.request(...loanParams7)


        const globalInterestRate9 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate9', fromWei(globalInterestRate9, 'gether'))

        const globalInterestRateNumerator9 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator9', fromWei(globalInterestRateNumerator9, 'gether'))

        const utilizationRatio9 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio9', fromWei(utilizationRatio9, 'gether'))

        const interestRate9 = Math.pow(fromWei(globalInterestRate9, 'gether'), 31536000)
        console.info('~interestRate9', interestRate9)
        console.info('====================================')


        assert.equal(BigNumber(fromWei(globalInterestRate9, 'gether')).gt(BigNumber(rateToSec('16'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate9, 'gether')).lt(BigNumber(rateToSec('16.2'))), true)


        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams8 = [
          this.fund,
          borrower,
          toWei(loanReq2.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs8, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan4 = await this.funds.request.call(...loanParams8)
        await this.funds.request(...loanParams8)


        const globalInterestRate10 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate10', fromWei(globalInterestRate10, 'gether'))

        const globalInterestRateNumerator10 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator10', fromWei(globalInterestRateNumerator10, 'gether'))

        const utilizationRatio10 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio10', fromWei(utilizationRatio10, 'gether'))

        const interestRate10 = Math.pow(fromWei(globalInterestRate10, 'gether'), 31536000)
        console.info('~interestRate10', interestRate10)
        console.info('====================================')


        assert.equal(BigNumber(fromWei(globalInterestRate10, 'gether')).gt(BigNumber(rateToSec('17'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate10, 'gether')).lt(BigNumber(rateToSec('17.2'))), true)


        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams9 = [
          this.fund,
          borrower,
          toWei(loanReq2.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs9, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan4 = await this.funds.request.call(...loanParams9)
        await this.funds.request(...loanParams9)


        const globalInterestRate11 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate11', fromWei(globalInterestRate11, 'gether'))

        const globalInterestRateNumerator11 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator11', fromWei(globalInterestRateNumerator11, 'gether'))

        const utilizationRatio11 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio11', fromWei(utilizationRatio11, 'gether'))

        const interestRate11 = Math.pow(fromWei(globalInterestRate11, 'gether'), 31536000)
        console.info('~interestRate11', interestRate11)
        console.info('====================================')


        assert.equal(BigNumber(fromWei(globalInterestRate11, 'gether')).gt(BigNumber(rateToSec('18'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate11, 'gether')).lt(BigNumber(rateToSec('18.3'))), true)


        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams10 = [
          this.fund,
          borrower,
          toWei(loanReq2.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs10, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan4 = await this.funds.request.call(...loanParams10)
        await this.funds.request(...loanParams10)


        const globalInterestRate12 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate12', fromWei(globalInterestRate12, 'gether'))

        const globalInterestRateNumerator12 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator12', fromWei(globalInterestRateNumerator12, 'gether'))

        const utilizationRatio12 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio12', fromWei(utilizationRatio12, 'gether'))

        const interestRate12 = Math.pow(fromWei(globalInterestRate12, 'gether'), 31536000)
        console.info('~interestRate12', interestRate12)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate12, 'gether')).gt(BigNumber(rateToSec('19'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate12, 'gether')).lt(BigNumber(rateToSec('19.4'))), true)


        await increaseTime(toSecs({ days: 1, minutes: 1 }))

        const loanParams11 = [
          this.fund,
          borrower,
          toWei(loanReq2.toString(), unit),
          col,
          toSecs({days: 10}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs11, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        this.loan4 = await this.funds.request.call(...loanParams11)
        await this.funds.request(...loanParams11)


        const globalInterestRate13 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate13', fromWei(globalInterestRate13, 'gether'))

        const globalInterestRateNumerator13 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator13', fromWei(globalInterestRateNumerator13, 'gether'))

        const utilizationRatio13 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio13', fromWei(utilizationRatio13, 'gether'))

        const interestRate13 = Math.pow(fromWei(globalInterestRate13, 'gether'), 31536000)
        console.info('~interestRate13', interestRate13)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate13, 'gether')).gte(BigNumber(rateToSec('20'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate13, 'gether')).lt(BigNumber(rateToSec('20.2'))), true)
      })
    })
  })
})
