const bitcoinjs = require('bitcoinjs-lib')
const { bitcoin } = require('./helpers/collateral/common.js')
const config = require('./helpers/collateral/config.js')

const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x, remove0x   }  = require('@liquality/ethereum-utils');
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
const YEAR_IN_SECONDS = BigNumber(31536000)

const stablecoins = [ { name: 'SAI', unit: 'ether' }, { name: 'USDC', unit: 'mwei' } ]

async function getContracts(stablecoin) {
  if (stablecoin == 'SAI') {
    const funds = await Funds.deployed();
    const loans = await Loans.deployed();
    const sales = await Sales.deployed();
    const token = await ExampleCoin.deployed();
    const pToken = await ExamplePausableSaiCoin.deployed();
    const med   = await Med.deployed();

    return { funds, loans, sales, token, pToken, med }
  } else if (stablecoin == 'USDC') {
    const med = await Med.deployed()
    const token = await ExampleUsdcCoin.deployed()
    const pToken = await ExamplePausableSaiCoin.deployed()
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

    const p2wsh = await P2WSH.deployed()
    const onDemandSpv = await ISPVRequestManager.deployed()

    await loans.setP2WSH(p2wsh.address)
    await loans.setOnDemandSpv(onDemandSpv.address)

    return { funds, loans, sales, token, pToken, med }
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

  contract(`${name} Loans`, accounts => {
    const lender     = accounts[0]
    const borrower   = accounts[1]
    const arbiter    = accounts[2]
    const liquidator = accounts[3]
    const lender2    = accounts[4]

    let currentTime
    let btcPrice

    const loanReq = 20; // 5 SAI
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

      col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      const { funds, loans, sales, token, pToken, med } = await getContracts(name)

      this.funds = funds
      this.loans = loans
      this.sales = sales
      this.token = token
      this.pToken = pToken
      this.med = med

      this.med.poke(numToBytes32(toWei(btcPrice, 'ether')))

      const fundParams = [
        toWei('1', unit),
        toWei('100', unit),
        toSecs({days: 1}),
        toSecs({days: 366}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
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

      // Ensure arbiter secret hash is next in line
      let secretHashIndex
      let secretHashesCount

      secretHashIndex = await this.funds.secretHashIndex.call(arbiter)
      secretHashesCount = await this.funds.secretHashesCount.call(arbiter)

      while ((parseInt(secretHashesCount) - parseInt(secretHashIndex)) !== 4) {
        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('30', unit))
        await this.funds.deposit(this.fund, toWei('30', unit))
        await this.funds.request(...loanParams)

        secretHashIndex = await this.funds.secretHashIndex.call(arbiter)
        secretHashesCount = await this.funds.secretHashesCount.call(arbiter)
      }

      this.loan = await this.funds.request.call(...loanParams)
      await this.funds.request(...loanParams)
    })

    describe('constructor', function() {
      it('should fail deploying Loans if token is pausable and paused', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.pToken.address, decimal)

        await this.pToken.pause()

        await expectRevert(Loans.new(funds.address, this.med.address, this.pToken.address, decimal), 'VM Exception while processing transaction: revert')

        await this.pToken.unpause()
      })
    })

    describe('setSales', function() {
      it('should fail if msg.sender is not deployer', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)

        await expectRevert(loans.setSales(sales.address, { from: accounts[1]}), 'VM Exception while processing transaction: revert')
      })
    })

    describe('setP2WSH', function() {
      it('should fail if msg.sender is not deployed', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        const p2wsh = await P2WSH.deployed()

        await expectRevert(loans.setP2WSH(p2wsh.address, { from: accounts[1] }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if p2wsh already set', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        const p2wsh = await P2WSH.deployed()

        await loans.setP2WSH(p2wsh.address)

        await expectRevert(loans.setP2WSH(p2wsh.address), 'VM Exception while processing transaction: revert')
      })
    })

    describe('setOnDemandSpv', function() {
      it('should fail if msg.sender is not deployed', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.token.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.token.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.token.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        const onDemandSpv = await ISPVRequestManager.deployed()

        await expectRevert(loans.setOnDemandSpv(onDemandSpv.address, { from: accounts[1] }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('create', function() {
      it('should fail if fund lender address does not match provided lender address', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender2, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(1)

        await expectRevert(this.loans.create(loanExpiration, usrs, vals, fundId), 'VM Exception while processing transaction: revert')
      })
    })

    describe('setSecretHashes', function() {
      it('should fail calling twice', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)

        const success = await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        await expectRevert(this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk)), 'VM Exception while processing transaction: revert')
      })

      it('should fail if called by address which is not the borrower, lender, or funds contract address', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)

        await expectRevert(this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk), { from: lender2 }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('fund', function() {
      it('should fail if secret hashes not set', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)

        // Push funds to loan fund
        await this.token.approve(this.loans.address, principal)

        await expectRevert(this.loans.fund(loan), 'VM Exception while processing transaction: revert')
      })

      it('should fail if called twice', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)
        await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        await this.token.approve(this.loans.address, principal)
        await this.loans.fund(loan)

        await expectRevert(this.loans.fund(loan), 'VM Exception while processing transaction: revert')
      })

      it('should fail if using pausable token that is paused', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.pToken.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.pToken.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.pToken.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await loans.create.call(loanExpiration, usrs, vals, fundId)
        await loans.create(loanExpiration, usrs, vals, fundId)
        const success = await loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        await this.pToken.approve(this.loans.address, principal)

        await this.pToken.pause()

        await expectRevert(loans.fund(loan), 'VM Exception while processing transaction: revert')

        await this.pToken.unpause()
      })
    })

    describe('approve', function() {
      it('should fail if not funded', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)
        await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        await this.token.approve(this.loans.address, principal)
        // await this.loans.fund(loan)

        await expectRevert(this.loans.approve(loan), 'VM Exception while processing transaction: revert')
      })

      it('should fail if msg.sender is not lender', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)
        await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        await this.token.approve(this.loans.address, principal)
        await this.loans.fund(loan)

        await expectRevert(this.loans.approve(loan, { from: accounts[1] }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if after current time is after approveExpiration', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)
        await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        await this.token.approve(this.loans.address, principal)
        await this.loans.fund(loan)

        await increaseTime(toSecs({ days: 1 }))

        await expectRevert(this.loans.approve(loan), 'VM Exception while processing transaction: revert')
      })
    })

    describe('repay', function() {
      it('should fail if loan is already off', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, lendSecs[0]) // accept loan repayment

        await expectRevert(this.loans.repay(this.loan, owedForLoan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if liquidation has started', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        const bal = await this.token.balanceOf.call(borrower)

        this.med.poke(numToBytes32(toWei((btcPrice * 0.6).toString(), 'ether')))

        const safe = await this.loans.safe.call(this.loan)
        assert.equal(safe, false)

        await this.token.transfer(liquidator, toWei('40', unit))
        await this.token.approve(this.loans.address, toWei('100', unit), { from: liquidator })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        this.sale = await this.loans.liquidate.call(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })
        await this.loans.liquidate(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })

        await expectRevert(this.loans.repay(this.loan, owedForLoan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if not withdrawn', async function() {
        await this.loans.approve(this.loan)

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        await expectRevert(this.loans.repay(this.loan, owedForLoan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if after loanExpiration', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        await increaseTime(toSecs({ days: 2, minutes: 5 }))

        await expectRevert(this.loans.repay(this.loan, owedForLoan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if amount is more than owedForLoan', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        await expectRevert(this.loans.repay(this.loan, BigNumber(owedForLoan).times(2).toFixed(), { from: borrower }), 'VM Exception while processing transaction: revert')
      })
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

      it('should accept successfully and send funds directly to lender if fundId is 0', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)
        const success = await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        await this.token.approve(this.loans.address, principal)
        await this.loans.fund(loan)

        await this.loans.approve(loan)

        await this.loans.withdraw(loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(loan)
        await this.loans.repay(loan, owedForLoan, { from: borrower })

        const balBefore = await this.token.balanceOf.call(lender)

        await this.loans.accept(loan, arbiterSecs[0]) // accept loan repayment

        const balAfter = await this.token.balanceOf.call(lender)

        const off = await this.loans.off.call(loan)
        assert.equal(off, true);
        assert.equal(BigNumber(balBefore).plus(principal).plus(interest).toString(), BigNumber(balAfter).toString())
      })

      it('should fail if loan is already accepted', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, arbiterSecs[0]) // accept loan repayment

        await expectRevert(this.loans.accept(this.loan, arbiterSecs[0]), 'VM Exception while processing transaction: revert')
      })

      it('should fail if withdrawn and not repaid', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await expectRevert(this.loans.accept(this.loan, arbiterSecs[0]), 'VM Exception while processing transaction: revert')
      })

      it('should fail if msg.sender is not lender or arbiter', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await expectRevert(this.loans.accept(this.loan, lendSecs[0], { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if secret does not hash to secretHashB1 or secretHashC1', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await expectRevert(this.loans.accept(this.loan, ensure0x(sha256(Math.random().toString()))), 'VM Exception while processing transaction: revert')
      })

      it('should fail if current time is greater than acceptExpiration', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await increaseTime(toSecs({ days: 5 }))

        await expectRevert(this.loans.accept(this.loan, lendSecs[0]), 'VM Exception while processing transaction: revert')
      })
    })

    describe('cancel', function() {
      it('should successfully cancel loan and return funds to loan fund', async function() {
        await this.loans.approve(this.loan)

        await this.loans.cancel(this.loan, lendSecs[0]) // cancel loan

        const off = await this.loans.off.call(this.loan)
        assert.equal(off, true);
      })

      it('should successfully cancel loan without secret if after seizureExpiration', async function() {
        await this.loans.approve(this.loan)

        await increaseTime(toSecs({ days: 30 }))

        await this.loans.cancel(this.loan) // cancel loan

        const off = await this.loans.off.call(this.loan)
        assert.equal(off, true);
      })

      it('should fail if loan is already accepted', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, arbiterSecs[0]) // accept loan repayment

        await expectRevert(this.loans.cancel(this.loan), 'VM Exception while processing transaction: revert')
      })

      it('should fail if not withdrawn', async function() {
        await this.loans.approve(this.loan)

        await expectRevert(this.loans.cancel(this.loan), 'VM Exception while processing transaction: revert')
      })

      it('should fail if current time is less than seizureExpiration and no secret is provided', async function() {
        await this.loans.approve(this.loan)

        await expectRevert(this.loans.cancel(this.loan), 'VM Exception while processing transaction: revert')
      })

      it('should fail if already liquidated', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        const bal = await this.token.balanceOf.call(borrower)

        this.med.poke(numToBytes32(toWei((btcPrice * 0.6).toString(), 'ether')))

        const safe = await this.loans.safe.call(this.loan)
        assert.equal(safe, false)

        await this.token.transfer(liquidator, toWei('40', unit))
        await this.token.approve(this.loans.address, toWei('100', unit), { from: liquidator })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        this.sale = await this.loans.liquidate.call(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })
        await this.loans.liquidate(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })

        await expectRevert(this.loans.cancel(this.loan), 'VM Exception while processing transaction: revert')
      })
    })

    describe('refund', function() {
      it('should return loan repayment to borrower', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const balBefore = await this.token.balanceOf.call(borrower)

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await increaseTime(toSecs({ days: 5 }))

        const balBeforeRefund = await this.token.balanceOf.call(borrower)

        await this.loans.refund(this.loan, { from: borrower })

        const balAfterRefund = await this.token.balanceOf.call(borrower)

        const off = await this.loans.off.call(this.loan)
        assert.equal(off, true);

        assert.equal(BigNumber(balBefore).toFixed(), BigNumber(balAfterRefund).toFixed())
        assert.equal(BigNumber(balBeforeRefund).plus(owedForLoan).toFixed(), BigNumber(balAfterRefund).toFixed())
      })

      it('should return loan repayment to borrower with non-custom fund', async function() {
        // Generate arbiter secret hashes
        await this.funds.generate(arbiterSechs, { from: arbiter })

        const fundParams = [
          toSecs({days: 366}),
          YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
          arbiter,
          false,
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

        await this.loans.approve(loan)

        await this.loans.withdraw(loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const balBefore = await this.token.balanceOf.call(borrower)

        const owedForLoan = await this.loans.owedForLoan.call(loan)
        await this.loans.repay(loan, owedForLoan, { from: borrower })

        await increaseTime(toSecs({ days: 5 }))

        const balBeforeRefund = await this.token.balanceOf.call(borrower)

        await this.loans.refund(loan, { from: borrower })

        const balAfterRefund = await this.token.balanceOf.call(borrower)

        const off = await this.loans.off.call(loan)
        assert.equal(off, true);

        assert.equal(BigNumber(balBefore).toFixed(), BigNumber(balAfterRefund).toFixed())
        assert.equal(BigNumber(balBeforeRefund).plus(owedForLoan).toFixed(), BigNumber(balAfterRefund).toFixed())
      })

      it('should fail if loan is already accepted', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        const paidBefore = await this.loans.paid.call(this.loan)

        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, lendSecs[0]) // accept loan repayment

        await expectRevert(this.loans.refund(this.loan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if loan has been liquidated', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        const bal = await this.token.balanceOf.call(borrower)

        this.med.poke(numToBytes32(toWei((btcPrice * 0.6).toString(), 'ether')))

        const safe = await this.loans.safe.call(this.loan)
        assert.equal(safe, false)

        await this.token.transfer(liquidator, toWei('40', unit))
        await this.token.approve(this.loans.address, toWei('100', unit), { from: liquidator })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        this.sale = await this.loans.liquidate.call(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })
        await this.loans.liquidate(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })

        await expectRevert(this.loans.refund(this.loan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if before acceptExpiration', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const balBefore = await this.token.balanceOf.call(borrower)

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await expectRevert(this.loans.refund(this.loan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if not repaid', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        await increaseTime(toSecs({ days: 5 }))

        await expectRevert(this.loans.refund(this.loan, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if msg.sender != borrower', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await increaseTime(toSecs({ days: 5 }))

        await expectRevert(this.loans.refund(this.loan, { from: lender }), 'VM Exception while processing transaction: revert')
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

        this.med.poke(numToBytes32(toWei((btcPrice * 0.6).toString(), 'ether')))

        const safe = await this.loans.safe.call(this.loan)
        assert.equal(safe, false)

        await this.token.transfer(liquidator, toWei('40', unit))
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

      // TODO: liquidate when it\'s a non-custom loan fund
    })

    describe('default', function() {
      it('should fail liquidation if current time before loan expiration', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await increaseTime(toSecs({ days: 1, hours: 23 }))

        await expectRevert(this.loans.liquidate(this.loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator }), 'VM Exception while processing transaction: revert')
      })

      it('should allow for liquidation to start if loan is defaulted', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await increaseTime(toSecs({ days: 2, minutes: 1 }))

        await this.token.transfer(liquidator, toWei('50', unit))
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

      it('should fail if loan is off', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        const paidBefore = await this.loans.paid.call(this.loan)

        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, lendSecs[0]) // accept loan repayment

        await expectRevert(this.loans.withdraw(this.loan, borSecs[0], { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if not funded', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)
        await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        // await this.token.approve(this.loans.address, principal)

        await expectRevert(this.loans.withdraw(this.loan, borSecs[0], { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if not approved', async function() {
        await expectRevert(this.loans.withdraw(this.loan, borSecs[0], { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if secret provided does not hash to secretHashA1', async function() {
        await this.loans.approve(this.loan)

        await expectRevert(this.loans.withdraw(this.loan, borSecs[1], { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if token is pausable and paused', async function() {
        const decimal = stablecoin.unit === 'ether' ? '18' : '6'

        const funds = await Funds.new(this.pToken.address, decimal)
        const loans = await Loans.new(funds.address, this.med.address, this.pToken.address, decimal)
        const sales = await Sales.new(loans.address, funds.address, this.med.address, this.pToken.address)

        await funds.setLoans(loans.address)
        await loans.setSales(sales.address)

        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await loans.create.call(loanExpiration, usrs, vals, fundId)
        await loans.create(loanExpiration, usrs, vals, fundId)
        const success = await loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        await this.pToken.transfer(lender, principal)
        // Push funds to loan fund
        await this.pToken.approve(loans.address, principal)

        await loans.fund(loan)

        await loans.approve(loan)

        await this.pToken.pause()

        await expectRevert(loans.withdraw(loan, borSecs[0], { from: borrower }), 'VM Exception while processing transaction: revert')

        await this.pToken.unpause()
      })
    })

    describe('setSales', function() {
      it('should not allow setSales to be called twice', async function() {
        await expectRevert(this.loans.setSales(this.loans.address), 'VM Exception while processing transaction: revert')
      })
    })

    describe('borrower', function() {
      it('should return borrower address', async function() {
        const borrowerAddress = await this.loans.borrower(this.loan)

        assert.equal(borrower, borrowerAddress)
      })
    })

    describe('lender', function() {
      it('should return lender address', async function() {
        const lenderAddress = await this.loans.lender(this.loan)

        assert.equal(lender, lenderAddress)
      })
    })

    describe('arbiter', function() {
      it('should return arbiter address', async function() {
        const arbiterAddress = await this.loans.arbiter(this.loan)

        assert.equal(arbiter, arbiterAddress)
      })
    })

    describe('owing', function() {
      it('should return principal + interest + fee when first requested', async function() {
        const principal = await this.loans.principal.call(this.loan)
        const interest = await this.loans.interest.call(this.loan)
        const fee = await this.loans.fee.call(this.loan)

        const owing = await this.loans.owing.call(this.loan)

        assert.equal(BigNumber(principal).plus(interest).plus(fee).toFixed(), BigNumber(owing).toFixed())
      })

      it('should return principal + interest + fee - repaid if parts of the loan were repaid', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).minus(10), { from: borrower })

        const principal = await this.loans.principal.call(this.loan)
        const interest = await this.loans.interest.call(this.loan)
        const fee = await this.loans.fee.call(this.loan)

        const owing = await this.loans.owing.call(this.loan)

        assert.equal(BigNumber(10).toFixed(), BigNumber(owing).toFixed())
      })
    })

    describe('funded', function() {
      it('should return boolean determining whether funds have been depositd into loan', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)
        const success = await this.loans.setSecretHashes(loan, borSechs, lendSechs, arbiterSechs, ensure0x(borpubk), ensure0x(lendpubk), ensure0x(arbiterpubk))

        // Push funds to loan fund
        await this.token.approve(this.loans.address, principal)

        const fundedBefore = await this.loans.funded.call(loan)

        await this.loans.fund(loan)

        const fundedAfter = await this.loans.funded.call(loan)

        assert.equal(fundedBefore, false)
        assert.equal(fundedAfter, true)
      })

      it('should return boolean determining whether funds have been depositd into loan', async function() {
        const { loanExpiration, principal, interest, penalty, fee, liquidationRatio, requestTimestamp } = await this.loans.loans.call(this.loan)
        const { refundableCollateral, seizableCollateral } = await this.loans.collaterals.call(this.loan)
        const usrs = [ borrower, lender, arbiter ]
        const vals = [ principal, interest, penalty, fee, BigNumber(refundableCollateral).plus(seizableCollateral).toFixed(), liquidationRatio, requestTimestamp ]
        const fundId = numToBytes32(0)

        const loan = await this.loans.create.call(loanExpiration, usrs, vals, fundId)
        await this.loans.create(loanExpiration, usrs, vals, fundId)

        await increaseTime(toSecs({ days: 1 }))

        await this.med.poke(numToBytes32(toWei(btcPrice, 'ether')), false)

        await expectRevert(this.loans.collateralValue(loan), 'VM Exception while processing transaction: revert')
      })
    })

    describe('approved', function() {
      it('should return boolean determining whether loan has been approved', async function() {
        const approvedBefore = await this.loans.approved.call(this.loan)

        await this.loans.approve(this.loan)

        const approvedAfter = await this.loans.approved.call(this.loan)

        assert.equal(approvedBefore, false)
        assert.equal(approvedAfter, true)
      })
    })

    describe('withdrawn', function() {
      it('should return boolean determining whether loan has been withdrawn', async function() {
        await this.loans.approve(this.loan)

        const withdrawnBefore = await this.loans.withdrawn.call(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        const withdrawnAfter = await this.loans.withdrawn.call(this.loan)

        assert.equal(withdrawnBefore, false)
        assert.equal(withdrawnAfter, true)
      })
    })

    describe('paid', function() {
      it('should return boolean determining whether loan has been repaid', async function() {
        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)

        const paidBefore = await this.loans.paid.call(this.loan)

        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        const paidAfter = await this.loans.paid.call(this.loan)

        assert.equal(paidBefore, false)
        assert.equal(paidAfter, true)
      })
    })
  })
})
