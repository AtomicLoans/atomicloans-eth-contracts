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

async function getCurrentTime() {
  const latestBlockNumber = await web3.eth.getBlockNumber()
  const latestBlockTimestamp = (await web3.eth.getBlock(latestBlockNumber)).timestamp
  return latestBlockTimestamp
}

stablecoins.forEach((stablecoin) => {
  const { name, unit } = stablecoin

  contract(`${name} Loans`, accounts => {
    const lender     = accounts[0]
    const borrower   = accounts[1]
    const arbiter      = accounts[2]
    const liquidator = accounts[3]

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
        toWei('1', unit),
        toWei('100', unit),
        toSecs({days: 1}),
        toSecs({days: 366}),
        BigNumber(2).pow(256).minus(1).toFixed(),
        toWei('1.5', 'gether'), // 150% collateralization ratio
        toWei(rateToSec('16.5'), 'gether'), // 16.50%
        toWei(rateToSec('3'), 'gether'), //  3.00%
        toWei(rateToSec('0.75'), 'gether'), //  0.75%
        arbiter,
        false,
        0
      ]

      this.fund = await this.funds.createCustom.call(...fundParams)
      await this.funds.createCustom(...fundParams)

      // Generate arbiter secret hashes
      await this.funds.generate(arbiterSechs, { from: arbiter })

      // Set Lender PubKey
      await this.funds.setPubKey(ensure0x(arbiterpubk), { from: arbiter })

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', unit))
      await this.funds.deposit(this.fund, toWei('100', unit))

      // Pull from loan
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
    })

    describe('accept', function() {
      it('should accept successfully if lender secret provided', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, lendSecs[0]) // accept loan repayment

        const currentTime = await getCurrentTime()
        const { closedTimestamp } = await this.loans.loans.call(this.loan)

        expect(currentTime.toString()).to.equal(BigNumber(closedTimestamp).toString())

        const off = await this.loans.off.call(this.loan)
        assert.equal(off, true);
      })

      it('should accept successfully if arbiter secret provided', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, arbiterSecs[0]) // accept loan repayment

        const off = await this.loans.off.call(this.loan)
        assert.equal(off, true);
      })
    })

    describe('getters', function() {
      it('should add borrower to borrowerLoans list after requesting loan', async function() {
        const borrowerLoanCount = await this.loans.borrowerLoanCount.call(borrower)
        const borrowerLoan = await this.loans.borrowerLoans.call(borrower, borrowerLoanCount.toNumber() - 1)

        assert.equal(borrowerLoan, this.loan)
      })

      it('should add lender to lenderLoans list after requesting loan', async function() {
        const lenderLoanCount = await this.loans.lenderLoanCount.call(lender)
        const lenderLoan = await this.loans.lenderLoans.call(lender, lenderLoanCount.toNumber() - 1)

        assert.equal(lenderLoan, this.loan)
      })
    })

    describe('liquidate', function() {
      it('should be safe if above liquidation ratio', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        const bal = await this.token.balanceOf.call(borrower)

        const safe = await this.loans.safe.call(this.loan)
        assert.equal(safe, true)
      })

      it('should succeed at creating a sale if below liquidation ratio', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        const bal = await this.token.balanceOf.call(borrower)

        this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

        const safe = await this.loans.safe.call(this.loan)
        assert.equal(safe, false)

        await this.token.transfer(liquidator, toWei('5', unit))
        await this.token.approve(this.loans.address, toWei('100', unit), { from: liquidator })

        this.sale = await this.loans.liquidate.call(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })
        await this.loans.liquidate(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })

        const colvWei = await this.loans.collateralValue.call(this.loan)
        const colv = fromWei(colvWei)

        const col = await this.loans.collateral.call(this.loan)

        await this.sales.provideSecret(this.sale, lendSecs[1])
        await this.sales.provideSecret(this.sale, borSecs[1], { from: borrower })
        await this.sales.provideSecret(this.sale, liquidatorSecs[0])

        await this.sales.accept(this.sale)

        const taken = await this.sales.accepted.call(this.sale)
        assert.equal(taken, true)
      })
    })

    describe('default', function() {
      it('should fail liquidation if current time before loan expiration', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await time.increase(toSecs({days: 1, hours: 23}))

        await expectRevert(this.loans.liquidate(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator }), 'VM Exception while processing transaction: revert')
      })

      it('should allow for liquidation to start if loan is defaulted', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await time.increase(toSecs({days: 2, minutes: 1}))

        await this.token.transfer(liquidator, toWei('5', unit))
        await this.token.approve(this.loans.address, toWei('100', unit), { from: liquidator })

        this.sale = await this.loans.liquidate.call(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })
        await this.loans.liquidate(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })

        const sale = await this.loans.sale.call(this.loan)
        assert.equal(sale, true)
      })
    })

    describe('withdraw', function() {
      it('should fail trying to withdraw twice', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await expectRevert(this.loans.withdraw(this.loan, borSecs[0], { from: borrower }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('setSales', function() {
      it('should not allow setSales to be called twice', async function() {
        await expectRevert(this.loans.setSales(this.loans.address), 'VM Exception while processing transaction: revert')
      })
    })
  })
})
