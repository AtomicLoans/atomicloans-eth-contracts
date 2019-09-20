const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x, remove0x   }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
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

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const BTC_TO_SAT = 10**8

console.info = () => {} // Silence the Deprecation Warning

const stablecoins = [ { name: 'DAI', unit: 'ether' }, { name: 'USDC', unit: 'mwei' } ]

async function getContracts(stablecoin) {
  if (stablecoin == 'DAI') {
    const funds = await Funds.deployed();
    const loans = await Loans.deployed();
    const sales = await Sales.deployed();
    const token = await ExampleCoin.deployed();
    const med   = await Med.deployed();

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
    const sales = await Sales.new(loans.address, med.address, token.address)

    await funds.setLoans(loans.address)
    await loans.setSales(sales.address)

    return { funds, loans, sales, token, med }
  }
}

stablecoins.forEach((stablecoin) => {
  const { name, unit } = stablecoin

  contract(`${name} Global Interest Rate Decrease`, accounts => {

    const lender     = accounts[0]
    const borrower   = accounts[1]
    const arbiter      = accounts[2]
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

      btcPrice = '9340.23'

      col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      const { funds, loans, sales, token, med } = await getContracts(name)

      this.funds = funds
      this.loans = loans
      this.sales = sales
      this.token = token
      this.med = med

      this.med.poke(numToBytes32(toWei(btcPrice, 'ether')))

      const fundParams = [
        toSecs({days: 366}),
        BigNumber(2).pow(256).minus(1).toFixed(),
        arbiter,
        false,
        0
      ]

      this.fund = await this.funds.create.call(...fundParams)
      await this.funds.create(...fundParams)

      this.fund2 = await this.funds.create.call(...fundParams, { from: lender2 })
      await this.funds.create(...fundParams, { from: lender2 })

      // Generate arbiter secret hashes
      await this.funds.generate(arbiterSechs, { from: arbiter })

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(lendpubk))
      await this.funds.setPubKey(ensure0x(lendpubk), { from: lender2 })
      await this.funds.setPubKey(ensure0x(arbiterpubk), { from: arbiter })

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('1300', unit))
      await this.funds.deposit(this.fund, toWei('400', unit))

      await this.token.transfer(lender2, toWei('100', unit))
      await this.token.approve(this.funds.address, toWei('100', unit), { from: lender2 })
      await this.funds.deposit(this.fund2, toWei('100', unit), { from: lender2 })
    })

    describe('global interest rate', function() {
      it('should increase global interest rate after a day if utilization ratio increases', async function() {
        const globalInterestRate = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate', fromWei(globalInterestRate, 'gether'))

        const globalInterestRateNumerator = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator', fromWei(globalInterestRateNumerator, 'gether'))

        const utilizationRatio = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio', fromWei(utilizationRatio, 'gether'))
        console.info('====================================')

        await time.increase(toSecs({ days: 1, minutes: 1 }))

        const loanParams = [
          this.fund,
          borrower,
          toWei(loanReq3.toString(), unit),
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


        await time.increase(toSecs({ days: 1, minutes: 1 }))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))


        const globalInterestRate3 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate3', fromWei(globalInterestRate3, 'gether'))

        const globalInterestRateNumerator3 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator3', fromWei(globalInterestRateNumerator3, 'gether'))

        const utilizationRatio3 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio3', fromWei(utilizationRatio3, 'gether'))

        const interestRate3 = Math.pow(fromWei(globalInterestRate3, 'gether'), 31536000)
        console.info('~interestRate3', interestRate3)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate3, 'gether')).gte(BigNumber(rateToSec('9.9999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate3, 'gether')).lt(BigNumber(rateToSec('10.1'))), true)

        await time.increase(toSecs({ days: 1, minutes: 1 }))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('140', unit))
        await this.funds.deposit(this.fund, toWei('140', unit))


        const globalInterestRate4 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate4', fromWei(globalInterestRate4, 'gether'))

        const globalInterestRateNumerator4 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator4', fromWei(globalInterestRateNumerator4, 'gether'))

        const utilizationRatio4 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio4', fromWei(utilizationRatio4, 'gether'))

        const interestRate4 = Math.pow(fromWei(globalInterestRate4, 'gether'), 31536000)
        console.info('~interestRate4', interestRate4)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate4, 'gether')).gte(BigNumber(rateToSec('8.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate4, 'gether')).lt(BigNumber(rateToSec('9.1'))), true)

        await time.increase(toSecs({ days: 1, minutes: 1 }))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('200', unit))
        await this.funds.deposit(this.fund, toWei('200', unit))


        const globalInterestRate5 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate5', fromWei(globalInterestRate5, 'gether'))

        const globalInterestRateNumerator5 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator5', fromWei(globalInterestRateNumerator5, 'gether'))

        const utilizationRatio5 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio5', fromWei(utilizationRatio5, 'gether'))

        const interestRate5 = Math.pow(fromWei(globalInterestRate5, 'gether'), 31536000)
        console.info('~interestRate5', interestRate5)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate5, 'gether')).gte(BigNumber(rateToSec('7.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate5, 'gether')).lt(BigNumber(rateToSec('8.1'))), true)


        await time.increase(toSecs({ days: 1, minutes: 1 }))

        await this.token.approve(this.funds.address, toWei('300', unit))
        await this.funds.deposit(this.fund, toWei('300', unit))


        const globalInterestRate6 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate6', fromWei(globalInterestRate6, 'gether'))

        const globalInterestRateNumerator6 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator6', fromWei(globalInterestRateNumerator6, 'gether'))

        const utilizationRatio6 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio6', fromWei(utilizationRatio6, 'gether'))

        const interestRate6 = Math.pow(fromWei(globalInterestRate6, 'gether'), 31536000)
        console.info('~interestRate6', interestRate6)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate6, 'gether')).gt(BigNumber(rateToSec('6.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate6, 'gether')).lt(BigNumber(rateToSec('7.1'))), true)

        await time.increase(toSecs({ days: 1, minutes: 1 }))

        await this.token.approve(this.funds.address, toWei('580', unit))
        await this.funds.deposit(this.fund, toWei('580', unit))


        const globalInterestRate7 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate7', fromWei(globalInterestRate7, 'gether'))

        const globalInterestRateNumerator7 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator7', fromWei(globalInterestRateNumerator7, 'gether'))

        const utilizationRatio7 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio7', fromWei(utilizationRatio7, 'gether'))

        const interestRate7 = Math.pow(fromWei(globalInterestRate7, 'gether'), 31536000)
        console.info('interestRate7', interestRate7)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate7, 'gether')).gt(BigNumber(rateToSec('5.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate7, 'gether')).lt(BigNumber(rateToSec('6.2'))), true)


        await time.increase(toSecs({ days: 1, minutes: 1 }))

        await this.token.approve(this.funds.address, toWei('1700', unit))
        await this.funds.deposit(this.fund, toWei('1700', unit))


        const globalInterestRate8 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate8', fromWei(globalInterestRate8, 'gether'))

        const globalInterestRateNumerator8 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator8', fromWei(globalInterestRateNumerator8, 'gether'))

        const utilizationRatio8 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio8', fromWei(utilizationRatio8, 'gether'))

        const interestRate8 = Math.pow(fromWei(globalInterestRate8, 'gether'), 31536000)
        console.info('interestRate8', interestRate8)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate8, 'gether')).gt(BigNumber(rateToSec('4.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate8, 'gether')).lt(BigNumber(rateToSec('5.2'))), true)

        const marketLiquidity = await this.funds.marketLiquidity.call()
        const totalBorrow = await this.funds.totalBorrow.call()

        console.info('marketLiquidity', fromWei(marketLiquidity, unit))
        console.info('totalBorrow', fromWei(totalBorrow, unit))



        await time.increase(toSecs({ days: 1, minutes: 1 }))

        const loanParams7 = [
          this.fund,
          borrower,
          toWei(loanReq4.toString(), unit),
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
        console.info('interestRate9', interestRate9)
        console.info('====================================')


        assert.equal(BigNumber(fromWei(globalInterestRate9, 'gether')).gt(BigNumber(rateToSec('5.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate9, 'gether')).lt(BigNumber(rateToSec('6.2'))), true)


        await time.increase(toSecs({ days: 1, minutes: 1 }))


        await this.token.approve(this.funds.address, toWei('1200', unit))
        await this.funds.deposit(this.fund, toWei('1200', unit))


        const globalInterestRate10 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate10', fromWei(globalInterestRate10, 'gether'))

        const globalInterestRateNumerator10 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator10', fromWei(globalInterestRateNumerator10, 'gether'))

        const utilizationRatio10 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio10', fromWei(utilizationRatio10, 'gether'))

        const interestRate10 = Math.pow(fromWei(globalInterestRate10, 'gether'), 31536000)
        console.info('interestRate10', interestRate10)
        console.info('====================================')


        assert.equal(BigNumber(fromWei(globalInterestRate10, 'gether')).gt(BigNumber(rateToSec('4.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate10, 'gether')).lt(BigNumber(rateToSec('5.2'))), true)


        await time.increase(toSecs({ days: 1, minutes: 1 }))

        await this.token.approve(this.funds.address, toWei('1700', unit))
        await this.funds.deposit(this.fund, toWei('1700', unit))


        const globalInterestRate11 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate11', fromWei(globalInterestRate11, 'gether'))

        const globalInterestRateNumerator11 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator11', fromWei(globalInterestRateNumerator11, 'gether'))

        const utilizationRatio11 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio11', fromWei(utilizationRatio11, 'gether'))

        const interestRate11 = Math.pow(fromWei(globalInterestRate11, 'gether'), 31536000)
        console.info('interestRate11', interestRate11)
        console.info('====================================')


        assert.equal(BigNumber(fromWei(globalInterestRate11, 'gether')).gt(BigNumber(rateToSec('3.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate11, 'gether')).lt(BigNumber(rateToSec('4.2'))), true)


        await time.increase(toSecs({ days: 1, minutes: 1 }))


        await this.token.approve(this.funds.address, toWei('2500', unit))
        await this.funds.deposit(this.fund, toWei('2500', unit))


        const globalInterestRate12 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate12', fromWei(globalInterestRate12, 'gether'))

        const globalInterestRateNumerator12 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator12', fromWei(globalInterestRateNumerator12, 'gether'))

        const utilizationRatio12 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio12', fromWei(utilizationRatio12, 'gether'))

        const interestRate12 = Math.pow(fromWei(globalInterestRate12, 'gether'), 31536000)
        console.info('interestRate12', interestRate12)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate12, 'gether')).gt(BigNumber(rateToSec('2.999'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate12, 'gether')).lt(BigNumber(rateToSec('3.3'))), true)


        await time.increase(toSecs({ days: 1, minutes: 1 }))


        await this.token.approve(this.funds.address, toWei('3300', unit))
        await this.funds.deposit(this.fund, toWei('3300', unit))


        const globalInterestRate13 = await this.funds.globalInterestRate.call()
        console.info('globalInterestRate13', fromWei(globalInterestRate13, 'gether'))

        const globalInterestRateNumerator13 = await this.funds.globalInterestRateNumerator.call()
        console.info('globalInterestRateNumerator13', fromWei(globalInterestRateNumerator13, 'gether'))

        const utilizationRatio13 = await this.funds.lastUtilizationRatio.call()
        console.info('utilizationRatio13', fromWei(utilizationRatio13, 'gether'))

        const interestRate13 = Math.pow(fromWei(globalInterestRate13, 'gether'), 31536000)
        console.info('interestRate13', interestRate13)
        console.info('====================================')

        assert.equal(BigNumber(fromWei(globalInterestRate13, 'gether')).gte(BigNumber(rateToSec('2.499'))), true)
        assert.equal(BigNumber(fromWei(globalInterestRate13, 'gether')).lt(BigNumber(rateToSec('2.5111'))), true)
      })
    })
  })
})
