const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
const axios         = require('axios');

const ExampleCoin = artifacts.require("./ExampleSaiCoin.sol");
const ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
const ExamplePausableSaiCoin = artifacts.require("./ExamplePausableSaiCoin.sol")
const USDCInterestRateModel = artifacts.require('./USDCInterestRateModel.sol')
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const ISPVRequestManager = artifacts.require('./ISPVRequestManager.sol');
const P2WSH  = artifacts.require('./P2WSH.sol');
const Med = artifacts.require('./MedianizerExample.sol');

const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');
const Comptroller = artifacts.require('./Comptroller.sol')

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const BTC_TO_SAT = 10**8

const stablecoins = [ { name: 'SAI', unit: 'ether' }, { name: 'USDC', unit: 'mwei' } ]

async function getContracts(stablecoin) {
  if (stablecoin == 'SAI') {
    const funds = await Funds.deployed();
    const loans = await Loans.deployed();
    const sales = await Sales.deployed();
    const token = await ExampleCoin.deployed();
    const cToken = await CErc20.deployed();
    const pToken = await ExamplePausableSaiCoin.deployed();
    const med   = await Med.deployed();

    return { funds, loans, sales, token, cToken, pToken, med }
  } else if (stablecoin == 'USDC') {
    const med = await Med.deployed()
    const token = await ExampleUsdcCoin.deployed()
    const pToken = await ExamplePausableSaiCoin.new()
    const comptroller = await Comptroller.deployed()
    const usdcInterestRateModel = await USDCInterestRateModel.deployed()
    const cToken = await CErc20.new(token.address, comptroller.address, usdcInterestRateModel.address, toWei('0.2', 'finney'), 'Compound Usdc', 'cUSDC', '8')

    await comptroller._supportMarket(cToken.address)

    const funds = await Funds.new(token.address, '6')
    await funds.setCompound(cToken.address, comptroller.address)

    const loans = await Loans.new(funds.address, med.address, token.address, '6')
    const sales = await Sales.new(loans.address, funds.address, med.address, token.address)

    await funds.setLoans(loans.address)
    await loans.setSales(sales.address)

    const p2wsh = await P2WSH.deployed()
    const onDemandSpv = await ISPVRequestManager.deployed()

    await loans.setP2WSH(p2wsh.address)
    await loans.setOnDemandSpv(onDemandSpv.address)

    return { funds, loans, sales, token, cToken, pToken, med }
  }
}

async function getCurrentTime() {
  const latestBlockNumber = await web3.eth.getBlockNumber()
  const latestBlockTimestamp = (await web3.eth.getBlock(latestBlockNumber)).timestamp
  return latestBlockTimestamp
}

stablecoins.forEach((stablecoin) => {
  const { name, unit } = stablecoin

  contract(`${name} Funds`, accounts => {
    const lender = accounts[0]
    const borrower = accounts[1]
    const arbiter = accounts[2]
    const lender2 = accounts[3]
    const lender3 = accounts[4]
    const withdrawRecipient = accounts[5]

    let currentTime
    let btcPrice

    const loanReq = 20; // 5 SAI
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

      const { funds, loans, sales, token, cToken, pToken, med } = await getContracts(name)

      this.funds = funds
      this.loans = loans
      this.sales = sales
      this.token = token
      this.cToken = cToken
      this.pToken = pToken
      this.med = med

      this.med.poke(numToBytes32(toWei(btcPrice, 'ether')))

      const fundParams = [
        toWei('10', unit),
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
    })

    describe('create', function() {
      it('should fail if user tries to create two loan funds', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        await this.funds.create(...fundParams, { from: lender2 })

        await expectRevert(this.funds.create(...fundParams, { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should succeed in updating non-custom loan fund', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        this.fund2 = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        const newFundExpiry = Math.floor(Date.now() / 1000) + toSecs({days: 366})

        const fundParams2 = [
          BigNumber(2).pow(256).minus(1).toFixed(),
          newFundExpiry,
          arbiter
        ]

        await this.funds.update(this.fund2, ...fundParams2)

        const maxLoanDur = await this.funds.maxLoanDur.call(this.fund2)
        const fundExpiry = await this.funds.fundExpiry.call(this.fund2)

        assert.equal(maxLoanDur, BigNumber(2).pow(256).minus(1).toFixed())
        assert.equal(fundExpiry, newFundExpiry)
      })

      it('should fail in updating non-custom loan fund with 2**256-1 maxLoanDur and fundExpiry', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        this.fund3 = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        const fundParams3 = [
          BigNumber(2).pow(256).minus(1).toFixed(),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter
        ]

        await expectRevert(this.funds.update(this.fund3, ...fundParams3), 'VM Exception while processing transaction: revert')
      })

      it('should fail creating loan fund with 2**256-1 fundExpiry and maxLoanDur', async function() {
        const fundParams = [
          BigNumber(2).pow(256).minus(1).toFixed(),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        await expectRevert(this.funds.create(...fundParams), 'VM Exception while processing transaction: revert')
      })

      it('should fail creating loan fund with 0 fundExpiry and maxLoanDur', async function() {
        const fundParams = [
          0,
          0,
          arbiter,
          false,
          0
        ]

        await expectRevert(this.funds.create(...fundParams), 'VM Exception while processing transaction: revert')
      })

      it('should succeed in withdrawing from non-custom loan fund', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          true,
          0
        ]

        this.fund2 = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund2, toWei('100', unit))

        // Pull funds from loan fund
        await this.funds.withdraw(this.fund2, toWei('50', unit))
      })

      it('should succeed with setCompoundEnabled false if compoundSet is false', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        await this.token.transfer(lender, toWei('100', unit))
        await this.token.approve(funds.address, toWei('100', unit))

        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          toWei('100', unit)
        ]

        const balBefore = await this.token.balanceOf.call(funds.address)

        const fund = await funds.create.call(...fundParams)
        await funds.create(...fundParams)

        const balAfter = await this.token.balanceOf.call(funds.address)

        expect(BigNumber(balBefore).plus(toWei('100', unit)).toFixed()).to.equal(BigNumber(balAfter).toFixed())
      })

      it('should fail with setCompoundEnabled true if compoundSet is false', async function() {
        const funds = await Funds.new(this.token.address, '18')
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, '18')
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        await this.token.transfer(lender, toWei('100', unit))
        await this.token.approve(funds.address, toWei('100', unit))

        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          true,
          toWei('100', unit)
        ]

        await expectRevert(funds.create(...fundParams), 'VM Exception while processing transaction: revert')
      })

      it('should deposit funds on create if amount > 0', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          toWei('100', unit)
        ]

        await this.token.transfer(lender, toWei('100', unit))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit), { from: lender })

        const balBefore = await this.token.balanceOf.call(this.funds.address)

        this.fund2 = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        const balAfter = await this.token.balanceOf.call(this.funds.address)

        expect(BigNumber(balBefore).plus(toWei('100', unit)).toFixed()).to.equal(BigNumber(balAfter).toFixed())
      })
    })

    describe('createCustom', function() {
      it('should fail if user tries to create two loan funds', async function() {
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

        await this.funds.createCustom(...fundParams, { from: lender3 })

        await expectRevert(this.funds.createCustom(...fundParams, { from: lender3 }), 'VM Exception while processing transaction: revert')
      })

      it('should fail creating custom loan fund with 2**256-1 fundExpiry and maxLoanDur', async function() {
        const fundParams = [
          toWei('1', unit),
          toWei('100', unit),
          toSecs({days: 1}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          BigNumber(2).pow(256).minus(1).toFixed(),
          toWei('1.5', 'gether'), // 150% collateralization ratio
          toWei(rateToSec('16.5'), 'gether'), // 16.50%
          toWei(rateToSec('3'), 'gether'), //  3.00%
          toWei(rateToSec('0.75'), 'gether'), //  0.75%
          arbiter,
          false,
          0
        ]

        await expectRevert(this.funds.createCustom(...fundParams), 'VM Exception while processing transaction: revert')
      })

      it('should fail creating custom loan fund with 0 fundExpiry and maxLoanDur', async function() {
        const fundParams = [
          toWei('1', unit),
          toWei('100', unit),
          toSecs({days: 1}),
          0,
          0,
          toWei('1.5', 'gether'), // 150% collateralization ratio
          toWei(rateToSec('16.5'), 'gether'), // 16.50%
          toWei(rateToSec('3'), 'gether'), //  3.00%
          toWei(rateToSec('0.75'), 'gether'), //  0.75%
          arbiter,
          false,
          0
        ]

        await expectRevert(this.funds.createCustom(...fundParams), 'VM Exception while processing transaction: revert')
      })

      it('should succeed with setCompoundEnabled false if compoundSet is false', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        await this.token.transfer(lender, toWei('100', unit))
        await this.token.approve(funds.address, toWei('100', unit))

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
          toWei('100', unit)
        ]

        const balBefore = await this.token.balanceOf.call(funds.address)

        const fund = await funds.createCustom.call(...fundParams)
        await funds.createCustom(...fundParams)

        const balAfter = await this.token.balanceOf.call(funds.address)

        expect(BigNumber(balBefore).plus(toWei('100', unit)).toFixed()).to.equal(BigNumber(balAfter).toFixed())
      })

      it('should fail with setCompoundEnabled true if compoundSet is false', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        await this.token.approve(funds.address, toWei('20000', unit))

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
          true,
          toWei('100', unit)
        ]

        await expectRevert(funds.createCustom(...fundParams), 'VM Exception while processing transaction: revert')
      })
    })

    describe('deposit', function() {
      it('should fail depositing to fund if erc20 allowance less than amount', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        const fund = await funds.create.call(...fundParams)
        await funds.create(...fundParams)

        await expectRevert(funds.deposit(fund, toWei('100', unit)), 'VM Exception while processing transaction: revert')
      })

      it('should update cTokenMarketLiquidity if not custom and compoundEnabled', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          true,
          0
        ]

        fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await this.token.approve(this.funds.address, toWei('100', unit))

        const cBalBefore = await this.cToken.balanceOf.call(this.funds.address)
        const cTokenLiquidityBefore = await this.funds.cTokenMarketLiquidity.call()

        await this.funds.deposit(fund, toWei('100', unit))

        const cBalAfter = await this.cToken.balanceOf.call(this.funds.address)
        const cTokenLiquidityAfter = await this.funds.cTokenMarketLiquidity.call()

        assert.isAbove(parseInt(BigNumber(cBalAfter).toFixed()), parseInt(BigNumber(cBalBefore).toFixed()))
        assert.isAbove(parseInt(BigNumber(cTokenLiquidityAfter).toFixed()), parseInt(BigNumber(cTokenLiquidityBefore).toFixed()))
      })

      it('should not update cTokenMarketLiquidity if custom and compoundEnabled', async function() {
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
          true,
          0
        ]

        fund = await this.funds.createCustom.call(...fundParams)
        await this.funds.createCustom(...fundParams)

        await this.token.approve(this.funds.address, toWei('100', unit))

        const cBalBefore = await this.cToken.balanceOf.call(this.funds.address)
        const cTokenLiquidityBefore = await this.funds.cTokenMarketLiquidity.call()

        await this.funds.deposit(fund, toWei('100', unit))

        const cBalAfter = await this.cToken.balanceOf.call(this.funds.address)
        const cTokenLiquidityAfter = await this.funds.cTokenMarketLiquidity.call()

        expect(BigNumber(cBalAfter).toFixed(), BigNumber(cBalBefore).toFixed())
        expect(BigNumber(cTokenLiquidityAfter).toFixed(), BigNumber(cTokenLiquidityBefore).toFixed())
      })
    })

    describe('generate secret hashes', function() {
      it('should push secrets hashes to secretHashes for user address', async function() {
        const secretHashesCount = await this.funds.secretHashesCount.call(lender)

        const secretHashIndex = await this.funds.secretHashIndex.call(lender)

        // Generate lender secret hashes
        await this.funds.generate(lendSechs)

        const secretHashesCountAfter = await this.funds.secretHashesCount.call(lender)

        const sech0 = await this.funds.secretHashes.call(lender, parseInt(secretHashesCount))
        const sech1 = await this.funds.secretHashes.call(lender, parseInt(secretHashesCount) + 1)
        const sech2 = await this.funds.secretHashes.call(lender, parseInt(secretHashesCount) + 2)
        const sech3 = await this.funds.secretHashes.call(lender, parseInt(secretHashesCount) + 3)

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
        await this.token.transfer(arbiter, toWei('100', unit))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit), { from: arbiter })

        const balBefore = await this.token.balanceOf.call(this.funds.address)

        await this.funds.deposit(this.fund, toWei('100', unit), { from: arbiter })

        const balAfter = await this.token.balanceOf.call(this.funds.address)

        assert.equal(BigNumber(balAfter).minus(balBefore).toFixed(), toWei('100', unit));
      })

      it('should request and complete loan successfully if loan setup correctly', async function() {
        // Generate lender secret hashes
        await this.funds.generate(lendSechs)

        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Set Arbiter PubKey
        await this.funds.setPubKey(ensure0x(arbiterpubk), { from: arbiter })

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        // request collateralization ratio 2
        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

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

        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

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
          toWei('2', unit),
          toWei('99', unit),
          toSecs({days: 2}),
          toSecs({days: 364}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          toWei(rateToSec('16'), 'gether'), // 16.0%
          toWei(rateToSec('2.75'), 'gether'), //  3.00%
          toWei(rateToSec('0.5'), 'gether'), //  0.75%
          toWei('1.5', 'gether'), // 150% collateralization ratio
          arbiter
        ]

        await this.funds.updateCustom(this.fund, ...fundParams)

        const minLoanAmt = await this.funds.minLoanAmt.call(this.fund)
        const maxLoanAmt = await this.funds.maxLoanAmt.call(this.fund)
        const minLoanDur = await this.funds.minLoanDur.call(this.fund)
        const maxLoanDur = await this.funds.maxLoanDur.call(this.fund)
        const interest = await this.funds.interest.call(this.fund)
        const penalty = await this.funds.penalty.call(this.fund)
        const fee  = await this.funds.fee.call(this.fund)
        const liquidationRatio = await this.funds.liquidationRatio.call(this.fund)

        assert.equal(minLoanAmt, toWei('2', unit))
        assert.equal(maxLoanAmt, toWei('99', unit))
        assert.equal(minLoanDur, toSecs({days: 2}))
        assert.equal(maxLoanDur, toSecs({days: 364}))
        assert.equal(interest, toWei(rateToSec('16'), 'gether'))
        assert.equal(penalty, toWei(rateToSec('2.75'), 'gether'))
        assert.equal(fee, toWei(rateToSec('0.5'), 'gether'))
        assert.equal(liquidationRatio, toWei('1.5', 'gether'))
      })

      it('should fail changing of fund details with 2**256-1 fundExpiry and maxLoanDur', async function() {
        const fundParams = [
          toWei('2', unit),
          toWei('99', unit),
          toSecs({days: 2}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          BigNumber(2).pow(256).minus(1).toFixed(),
          toWei(rateToSec('16'), 'gether'), // 16.0%
          toWei(rateToSec('2.75'), 'gether'), //  3.00%
          toWei(rateToSec('0.5'), 'gether'), //  0.75%
          toWei('1.5', 'gether'), // 150% collateralization ratio
          arbiter
        ]

        await expectRevert(this.funds.updateCustom(this.fund, ...fundParams), 'VM Exception while processing transaction: revert')
      })
    })

    describe('update', function() {
      it('should fail if not called by lender', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        this.fund2 = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        const newFundExpiry = Math.floor(Date.now() / 1000) + toSecs({days: 366})

        const fundParams2 = [
          BigNumber(2).pow(256).minus(1).toFixed(),
          newFundExpiry,
          arbiter
        ]

        await expectRevert(this.funds.update(this.fund2, ...fundParams2, { from: lender2 }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('updateCustom', function() {
      it('should fail if not called by lender', async function() {
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
          arbiter
        ]

        await expectRevert(this.funds.updateCustom(this.fund, ...fundParams, { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if trying to update non-custom fund', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        const newFundExpiry = Math.floor(Date.now() / 1000) + toSecs({days: 366})

        const fundParams2 = [
          toWei('1', unit),
          toWei('100', unit),
          toSecs({days: 1}),
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          toWei('1.5', 'gether'), // 150% collateralization ratio
          toWei(rateToSec('16.5'), 'gether'), // 16.50%
          toWei(rateToSec('3'), 'gether'), //  3.00%
          toWei(rateToSec('0.75'), 'gether'), //  0.75%
          arbiter
        ]

        await expectRevert(this.funds.updateCustom(fund, ...fundParams2), 'VM Exception while processing transaction: revert')
      })
    })

    describe('request', function() {
      it('should fail if msg.sender is not lender', async function() {
        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

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

        await expectRevert(this.funds.request(...loanParams, { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if balance is less than amount requested', async function() {
        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

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

        const balance = await this.funds.balance.call(this.fund)
        await this.funds.withdraw(this.fund, balance)

        await expectRevert(this.funds.request(...loanParams), 'VM Exception while processing transaction: revert')
      })

      it('should fail if amount is less than min loan amount', async function() {
        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

        const loanParams = [
          this.fund,
          borrower,
          toWei('5', unit),
          col,
          toSecs({days: 2}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        await expectRevert(this.funds.request(...loanParams), 'revert')
      })

      it('should fail if amount is greater than max loan amount', async function() {
        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('105', unit))
        await this.funds.deposit(this.fund, toWei('105', unit))

        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

        const loanParams = [
          this.fund,
          borrower,
          toWei('105', unit),
          col,
          toSecs({days: 2}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        await expectRevert(this.funds.request(...loanParams), 'revert')
      })

      it('should succeed requesting from non-custom fund', async function() {
        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          true,
          0
        ]

        const fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(fund, toWei('100', unit))

        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

        const loanParams = [
          fund,
          borrower,
          toWei('20', unit),
          col,
          toSecs({days: 2}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        const loan = await this.funds.request.call(...loanParams)
        await this.funds.request(...loanParams)

        const { set } = await this.loans.secretHashes.call(loan)

        expect(set).to.equal(true)
      })
    })

    describe('withdraw funds', function() {
      it('should withdraw funds successfully if called by owner', async function() {
        // Generate lender secret hashes
        await this.funds.generate(lendSechs)

        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Set Lender PubKey
        await this.funds.setPubKey(ensure0x(lendpubk))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const oldBal = await this.token.balanceOf.call(this.funds.address)

        // Pull funds from loan fund
        await this.funds.withdraw(this.fund, toWei('50', unit))

        const newBal = await this.token.balanceOf.call(this.funds.address)

        assert.equal(oldBal - newBal, toWei('50', unit))
      })

      it('should fail withdrawing funds if not called by owner', async function() {
        // Generate lender secret hashes
        await this.funds.generate(lendSechs)

        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Set Lender PubKey
        await this.funds.setPubKey(ensure0x(lendpubk))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        // Pull funds from loan fund
        await expectRevert(this.funds.withdraw(this.fund, toWei('50', unit), { from: arbiter }), 'VM Exception while processing transaction: revert')
      })

      it('should allow withdrawing to a specific address as long as it\'s called by the owner of the fund', async function() {
        // Generate lender secret hashes
        await this.funds.generate(lendSechs)

        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Set Lender PubKey
        await this.funds.setPubKey(ensure0x(lendpubk))

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        const oldBal = await this.token.balanceOf.call(this.funds.address)
        const oldRecipientBal = await this.token.balanceOf.call(withdrawRecipient)

        // Pull funds from loan fund
        await this.funds.withdrawTo(this.fund, toWei('50', unit), withdrawRecipient)

        const newBal = await this.token.balanceOf.call(this.funds.address)
        const newRecipientBal = await this.token.balanceOf.call(withdrawRecipient)

        assert.equal(oldBal - newBal, toWei('50', unit))
        assert.equal(newRecipientBal - oldRecipientBal, toWei('50', unit))
      })

      // it('should fail withdrawing if amount is greater than fund balance', async function() {

      // })
    })

    describe('maxFundDuration', function () {
      it('should succeed if expiry of Fund is set after loan request', async function() {
        await this.token.approve(this.funds.address, toWei('100', unit))

        const fundParams = [
          toWei('1', unit),
          toWei('100', unit),
          toSecs({days: 1}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          parseInt(fromWei(currentTime, 'wei')) + toSecs({days: 30}),
          toWei('1.5', 'gether'), // 150% collateralization ratio
          toWei(rateToSec('16.5'), 'gether'), // 16.50%
          toWei(rateToSec('3'), 'gether'), //  3.00%
          toWei(rateToSec('0.75'), 'gether'), //  0.75%
          arbiter,
          false,
          toWei('100', unit)
        ]

        this.fund2 = await this.funds.createCustom.call(...fundParams)
        await this.funds.createCustom(...fundParams)

        await this.funds.generate(arbiterSechs, { from: arbiter })

        // request collateralization ratio 2
        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

        const loanParams = [
          this.fund2,
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

      it('should fail if expiry of Fund is set before loan request', async function() {
        await this.token.approve(this.funds.address, toWei('100', unit))

        const fundParams = [
          toWei('1', unit),
          toWei('100', unit),
          toSecs({days: 1}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          parseInt(fromWei(currentTime, 'wei')) + toSecs({days: 30}),
          toWei('1.5', 'gether'), // 150% collateralization ratio
          toWei(rateToSec('16.5'), 'gether'), // 16.50%
          toWei(rateToSec('3'), 'gether'), //  3.00%
          toWei(rateToSec('0.75'), 'gether'), //  0.75%
          arbiter,
          false,
          toWei('100', unit)
        ]

        this.fund2 = await this.funds.createCustom.call(...fundParams)
        await this.funds.createCustom(...fundParams)

        await this.funds.generate(arbiterSechs, { from: arbiter })

        // request collateralization ratio 2
        const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

        const loanParams = [
          this.fund2,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 31}),
          Math.floor(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        await expectRevert(this.funds.request(...loanParams), 'VM Exception while processing transaction: revert')
      })
    })

    describe('setLoans', function() {
      it('should not allow setLoans to be called twice', async function() {
        await expectRevert(this.funds.setLoans(this.loans.address), 'VM Exception while processing transaction: revert')
      })

      it('should not allow setLoans to be called by address other than deployer', async function() {
        await expectRevert(this.funds.setLoans(this.loans.address, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if token is pausable and paused', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.pToken.address, decimal)

        await this.pToken.pause()

        await expectRevert(funds.setLoans(this.loans.address), 'VM Exception while processing transaction: revert')
      })
    })

    describe('setCompound', function() {
      it('should not allow setLoans to be called by address other than deployer', async function() {
        await expectRevert(this.funds.setCompound(this.loans.address, this.loans.address, { from: borrower }), 'VM Exception while processing transaction: revert')
      })
    })
    
    describe('setUtilizationInterestDivisor', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setUtilizationInterestDivisor(toWei('10.5', 'gether'), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set utilizationInterestDivisor if called by deployer', async function() {
        const expectedUtilizationInterestDivisor = toWei('10.5', 'gether')
        await this.funds.setUtilizationInterestDivisor(expectedUtilizationInterestDivisor)

        const actualUtilizationInterestdivisor = await this.funds.utilizationInterestDivisor.call()

        assert.equal(expectedUtilizationInterestDivisor, actualUtilizationInterestdivisor)
      })
    })

    describe('setMaxUtilizationDelta', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setMaxUtilizationDelta(toWei('0.095', 'gether'), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set maxUtilizationDelta if called by deployer', async function() {
        const expectedMaxUtilizationDelta = toWei('0.095', 'gether')
        await this.funds.setMaxUtilizationDelta(expectedMaxUtilizationDelta)

        const actualMaxUtilizationDelta = await this.funds.maxUtilizationDelta.call()

        assert.equal(expectedMaxUtilizationDelta, actualMaxUtilizationDelta)
      })
    })

    describe('setGlobalInterestRateNumerator', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setGlobalInterestRateNumerator(toWei('0.095', 'gether'), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set maxUtilizationDelta if called by deployer', async function() {
        const expectedGlobalInterestRateNumerator = toWei('0.095', 'gether')
        await this.funds.setGlobalInterestRateNumerator(expectedGlobalInterestRateNumerator)

        const actualGlobalInterestRateNumerator = await this.funds.globalInterestRateNumerator.call()

        assert.equal(expectedGlobalInterestRateNumerator, actualGlobalInterestRateNumerator)
      })
    })

    describe('setGlobalInterestRate', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setGlobalInterestRate(toWei('0.1', 'gether'), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set globalInterestRate if called by deployer', async function() {
        const expectedGlobalInterestRate = toWei('0.1', 'gether')
        await this.funds.setGlobalInterestRate(expectedGlobalInterestRate)

        const actualGlobalInterestRate = await this.funds.globalInterestRate.call()

        assert.equal(expectedGlobalInterestRate, actualGlobalInterestRate)
      })
    })

    describe('setMaxInterestRateNumerator', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setMaxInterestRateNumerator(toWei('0.18', 'gether'), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set globalInterestRate if called by deployer', async function() {
        const expectedMaxInterestRateNumerator = toWei('0.18', 'gether')
        await this.funds.setMaxInterestRateNumerator(expectedMaxInterestRateNumerator)

        const actualMaxInterestRateNumerator = await this.funds.maxInterestRateNumerator.call()

        assert.equal(expectedMaxInterestRateNumerator, actualMaxInterestRateNumerator)
      })
    })

    describe('setMinInterestRateNumerator', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setMinInterestRateNumerator(toWei('0.025', 'gether'), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set globalInterestRate if called by deployer', async function() {
        const expectedMinInterestRateNumerator = toWei('0.025', 'gether')
        await this.funds.setMinInterestRateNumerator(expectedMinInterestRateNumerator)

        const actualMinInterestRateNumerator = await this.funds.minInterestRateNumerator.call()

        assert.equal(expectedMinInterestRateNumerator, actualMinInterestRateNumerator)
      })
    })

    describe('setInterestUpdateDelay', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setInterestUpdateDelay(toSecs({ days: 2 }), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set globalInterestRate if called by deployer', async function() {
        const expectedInterestUpdateDelay = toSecs({ days: 2 })
        await this.funds.setInterestUpdateDelay(expectedInterestUpdateDelay)

        const actualInterestUpdateDelay = await this.funds.interestUpdateDelay.call()

        assert.equal(expectedInterestUpdateDelay, actualInterestUpdateDelay)
      })
    })

    describe('setDefaultArbiterFee', function() {
      it('should fail if set by non deployer', async function() {
        await expectRevert(this.funds.setDefaultArbiterFee(toWei(rateToSec('0.5'), 'gether'), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })

      it('should set defaultArbiterFee if called by deployer', async function() {
        const expectedDefaultArbiterFee = toWei(rateToSec('0.5'), 'gether')
        await this.funds.setDefaultArbiterFee(expectedDefaultArbiterFee)

        const actualDefaultArbiterFee = await this.funds.defaultArbiterFee.call()

        assert.equal(expectedDefaultArbiterFee, actualDefaultArbiterFee)
      })

      it('should fail trying to set default arbiter fee > 1%', async function() {
        await expectRevert(this.funds.setDefaultArbiterFee(toWei(rateToSec('1.1'), 'gether')), 'VM Exception while processing transaction: revert')
      })
    })

    describe('secretHashesCount', function() {
      it('should return the secret hash count for a specific address', async function() {
        const secretHashesCountBefore = await this.funds.secretHashesCount.call(arbiter)

        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        const secretHashesCountAfter = await this.funds.secretHashesCount.call(arbiter)

        assert.equal(BigNumber(secretHashesCountBefore).plus(4).toFixed(), BigNumber(secretHashesCountAfter).toFixed())
      })
    })

    describe('enableCompound', function() {
      it('should fail if compoundSet is false', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        const fund = await funds.create.call(...fundParams)
        await funds.create(...fundParams)

        await expectRevert(funds.enableCompound(fund), 'VM Exception while processing transaction: revert')
      })

      it('should fail if compound already enabled', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          true,
          0
        ]

        fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await expectRevert(this.funds.enableCompound(fund), 'VM Exception while processing transaction: revert')
      })

      it('should fail if msg.sender isn\'t lender', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await expectRevert(this.funds.enableCompound(fund, { from: lender2 }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('disableCompound', function() {
      it('should fail if compound isn\'t already enabled', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          false,
          0
        ]

        fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await expectRevert(this.funds.disableCompound(fund), 'VM Exception while processing transaction: revert')
      })

      it('should fail if msg.sender isn\'t lender', async function() {
        const fundParams = [
          toSecs({days: 366}),
          BigNumber(2).pow(256).minus(1).toFixed(),
          arbiter,
          true,
          0
        ]

        fund = await this.funds.create.call(...fundParams)
        await this.funds.create(...fundParams)

        await expectRevert(this.funds.disableCompound(fund, { from: lender2 }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('decreaseTotalBorrow', function() {
      it('should fail calling if not loans contract address', async function() {
        await expectRevert(this.funds.decreaseTotalBorrow(toWei('1', 'ether')), 'VM Exception while processing transaction: revert')
      })

      it('should fail decreaseTotalBorrow if totalBorrow is 0', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(accounts[0])

        await expectRevert(this.funds.decreaseTotalBorrow(toWei('1', 'ether')), 'VM Exception while processing transaction: revert')
      })
    })
  })
})
