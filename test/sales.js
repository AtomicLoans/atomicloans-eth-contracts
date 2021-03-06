const { bitcoin } = require('./helpers/collateral/common.js')

const { time, expectRevert } = require('openzeppelin-test-helpers');

const toSecs = require('@mblackmblack/to-seconds');
const { sha256, ripemd160 } = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
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
const { toWei, hexToNumberString } = web3.utils;

const BTC_TO_SAT = 10 ** 8
const WAD = 10 ** 18
const SZABO = 10 ** 12
const YEAR_IN_SECONDS = BigNumber(31536000)

const stablecoins = [
  { name: 'DAI', unit: 'ether', multiplier: 1, divisor: 1, precision: 18 },
  { name: 'USDC', unit: 'mwei', multiplier: SZABO, divisor: WAD, precision: 10 }
]

const mockDateNow = () => {
  let current = Date.now()

  return () => {
    current += 5000;
    return current;
  }
}

global.Date.now = mockDateNow();

async function getContracts(stablecoin) {
  if (stablecoin == 'DAI') {
    const funds = await Funds.deployed();
    const loans = await Loans.deployed();
    const sales = await Sales.deployed();
    const collateral = await Collateral.deployed()
    const token = await ExampleCoin.deployed();
    const med   = await Med.deployed();

    return { funds, loans, sales, collateral, token, med }
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

    const p2wsh = await P2WSH.deployed()
    const onDemandSpv = await ISPVRequestManager.deployed()

    const collateral = await Collateral.new(loans.address)

    await collateral.setP2WSH(p2wsh.address)
    await collateral.setOnDemandSpv(onDemandSpv.address)

    await loans.setCollateral(collateral.address)

    return { funds, loans, sales, collateral, token, med }
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

async function approveAndTransfer(token, spender, contract, amount) {
  await token.transfer(spender, amount)
  await token.approve(contract.address, amount, { from: spender })
}

async function provideSecretsAndAccept(contract, instance, sec1, sec2, sec3) {
  await contract.provideSecret(instance, sec1)
  await contract.provideSecret(instance, sec2)
  await contract.provideSecret(instance, sec3)
  await contract.accept(instance)
}

async function liquidate(contract, instance, secretHash, pubKeyHash, liquidator) {
  const sale = await contract.liquidate.call(instance, secretHash, ensure0x(pubKeyHash), { from: liquidator })
  await contract.liquidate(instance, secretHash, ensure0x(pubKeyHash), { from: liquidator })
  return sale
}

async function liquidateAndIncreaseTime(contract, instance, secretHash, pubKeyHash, liquidator) {
  const sale = await liquidate(contract, instance, secretHash, pubKeyHash, liquidator)

  await increaseTime(toSecs({ hours: 4, minutes: 2 }))

  return sale
}

async function getLoanValues(contract, instance) {
  const collateral = await contract.collateral.call(instance)
  const collateralValue = await contract.collateralValue.call(instance)
  const minCollateralValue = await contract.minCollateralValue.call(instance)
  const owedToLender = await contract.owedToLender.call(instance)
  const fee  = await contract.fee.call(instance)
  const penalty = await contract.penalty.call(instance)
  const repaid = await contract.repaid.call(instance)
  const owedForLiquidation = await contract.owedForLiquidation.call(instance)
  const safe = await contract.safe.call(instance)

  return { collateral, collateralValue, minCollateralValue, owedToLender, fee, penalty, repaid, owedForLiquidation, safe }
}

async function getBalances(token, lender, borrower, arbiter, medianizer, funds) {
  const lendBal = await token.balanceOf.call(lender)
  const borBal = await token.balanceOf.call(borrower)
  const arbiterBal = await token.balanceOf.call(arbiter)
  const medBal = await token.balanceOf.call(medianizer)
  const fundBal = await token.balanceOf.call(funds)

  return { lendBal, borBal, arbiterBal, medBal, fundBal }
}

async function getBalancesBefore(token, lender, borrower, arbiter, medianizer, funds) {
  const {
    lendBal: lendBalBefore,
    borBal: borBalBefore,
    arbiterBal: arbiterBalBefore,
    medBal: medBalBefore,
    fundBal: fundBalBefore
  } = await getBalances(token, lender, borrower, arbiter, medianizer, funds)

  return { lendBalBefore, borBalBefore, arbiterBalBefore, medBalBefore, fundBalBefore }
}

async function getBalancesAfter(token, lender, borrower, arbiter, medianizer, funds) {
  const {
    lendBal: lendBalAfter,
    borBal: borBalAfter,
    arbiterBal: arbiterBalAfter,
    medBal: medBalAfter,
    fundBal: fundBalAfter
  } = await getBalances(token, lender, borrower, arbiter, medianizer, funds)

  return { lendBalAfter, borBalAfter, arbiterBalAfter, medBalAfter, fundBalAfter }
}

stablecoins.forEach((stablecoin) => {
  const { name, unit, multiplier, divisor, precision } = stablecoin

  contract(`${name} Sales`, accounts => {
    const lender   = accounts[0]
    const borrower = accounts[1]
    const arbiter    = accounts[2]
    const liquidator     = accounts[3]
    const liquidator2    = accounts[4]
    const liquidator3    = accounts[5]

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

    const loanReq = 25; // 25 DAI
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
        ~~(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      this.loan = await this.funds.request.call(...loanParams)
      await this.funds.request(...loanParams)
      await this.loans.approve(this.loan)
      await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

      const bal = await this.token.balanceOf.call(borrower)

      await this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

      const medValue = await this.med.read.call()

      const safe = await this.loans.safe.call(this.loan)
      assert.equal(safe, false)
    })

    describe('3 liquidations', function() {
      it('should allow for 3 liquidations before considered failed', async function() {
        await approveAndTransfer(this.token, liquidator, this.loans, toWei('100', unit))

        this.sale = await liquidateAndIncreaseTime(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)
        this.sale2 = await liquidateAndIncreaseTime(this.loans, this.loan, liquidatorSechs[1], liquidatorpbkh, liquidator)
        this.sale3 = await liquidateAndIncreaseTime(this.loans, this.loan, liquidatorSechs[2], liquidatorpbkh, liquidator)

        await expectRevert(this.loans.liquidate(this.loan, liquidatorSechs[2], ensure0x(liquidatorpbkh), { from: liquidator }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if liquidation called before previous liquidation is finished', async function() {
        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await expectRevert(this.loans.liquidate(this.loan, liquidatorSechs[1], ensure0x(liquidatorpbkh), { from: liquidator }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('create', function() {
      it('should fail if msg.sender isn\'t loans contract address', async function() {
        const secretHash = liquidatorSechs[0]

        await expectRevert(this.sales.create(
          secretHash,
          borrower,
          lender,
          arbiter,
          liquidator,
          secretHash,
          secretHash,
          secretHash,
          secretHash,
          ensure0x(ripemd160(borpubk))
        ), 'VM Exception while processing transaction: revert')
      })
    })

    describe('accept', function() {
      it('should disperse funds to rightful parties after partial repayment', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateralValue, minCollateralValue, repaid, owedToLender } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        await this.med.poke(numToBytes32(BigNumber(minCollateralValue).dividedBy(collateralValue).times(hexToNumberString(medValue)).times(0.99).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const { lendBalBefore, borBalBefore, arbiterBalBefore, fundBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])
        const { lendBalAfter, borBalAfter, arbiterBalAfter, fundBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        const { fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const discountBuy = await this.sales.discountBuy.call(this.sale)

        assert.equal(BigNumber(fundBalBefore).plus(owedToLender).toFixed(), BigNumber(fundBalAfter).toFixed())
        assert.equal(BigNumber(borBalBefore).plus(BigNumber(discountBuy).plus(repaid).minus(owedForLiquidation)).toFixed(), BigNumber(borBalAfter).toFixed())
        assert.equal(BigNumber(arbiterBalBefore).plus(fee).toFixed(), BigNumber(arbiterBalAfter).toFixed())

        const accepted = await this.sales.accepted.call(this.sale)
        assert.equal(accepted, true)
      })

      it('should disperse all funds to lender and arbiter if discountBuy + repaid doesn\'t cover principal + interest', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateralValue, minCollateralValue } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        await this.med.poke(numToBytes32(BigNumber(minCollateralValue).dividedBy(collateralValue).times(hexToNumberString(medValue)).times(0.57).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const { lendBalBefore, borBalBefore, arbiterBalBefore, fundBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])
        const { lendBalAfter, borBalAfter, arbiterBalAfter, fundBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        const { owedToLender, fee, penalty, repaid, owedForLiquidation, safe } = await getLoanValues(this.loans, this.loan)
        const discountBuy = await this.sales.discountBuy.call(this.sale)

        assert.equal(BigNumber(fundBalBefore).plus(BigNumber(discountBuy).plus(repaid)).minus(fee).toFixed(), fundBalAfter.toString())
        assert.equal(borBalBefore.toString(), borBalAfter.toString())
        assert.equal(BigNumber(arbiterBalBefore).plus(fee).toString(), arbiterBalAfter)

        const taken = await this.sales.accepted.call(this.sale)
        assert.equal(taken, true)
      })

      it('should disperse all funds to lender and arbiter if discountBuy + repaid covers only principal + interest + fee', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, repaid, owedToLender, fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender = 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender) / (medValue * 0.93 * collateral * BTC_TO_SAT)

        const num = BigNumber(repaid).times(-1).plus(owedToLender).plus(fee)
        const den = BigNumber(medValue).times(0.93).times(collateral).dividedBy(BTC_TO_SAT)
        const x = BigNumber(num).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(28)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const { lendBalBefore, borBalBefore, arbiterBalBefore, medBalBefore, fundBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])
        const { lendBalAfter, borBalAfter, arbiterBalAfter, medBalAfter, fundBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        const discountBuy = await this.sales.discountBuy.call(this.sale)

        assert.equal(BigNumber(fundBalBefore).plus(owedToLender).dividedBy(divisor).toFixed(precision - 1), BigNumber(fundBalAfter).dividedBy(divisor).toFixed(precision - 1))
        assert.equal(medBalBefore.toString(), medBalAfter.toString())
        assert.equal(BigNumber(arbiterBalBefore).plus(fee).toString(), arbiterBalAfter.toString())
        assert.equal(borBalBefore.toString(), borBalAfter.toString())

        const accepted = await this.sales.accepted.call(this.sale)
        assert.equal(accepted, true)
      })

      it('should disperse all remaining funds to medianizer if funds have been paid to lender and arbiter but not enough is needed to pay the penalty for the medianizer', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, fee, repaid, owedToLender } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender > 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender) / (medValue * 0.93 * collateral)

        const num = BigNumber(repaid).times(-1).plus(owedToLender).plus(fee).plus(1000) // increase slighlty to make statement true for ">"
        const den = BigNumber(medValue).times(0.93).times(collateral).dividedBy(BTC_TO_SAT)
        const x = BigNumber(num).times(multiplier).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(25)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const { lendBalBefore, borBalBefore, arbiterBalBefore, medBalBefore, fundBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])
        const { lendBalAfter, borBalAfter, arbiterBalAfter, medBalAfter, fundBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        const { penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const discountBuy = await this.sales.discountBuy.call(this.sale)

        assert.equal(BigNumber(fundBalBefore).plus(owedToLender).dividedBy(divisor).toFixed(precision), BigNumber(fundBalAfter).dividedBy(divisor).toFixed(precision))
        assert.equal(BigNumber(medBalBefore).plus(BigNumber(discountBuy).plus(repaid).minus(owedToLender).minus(fee)).toString(), medBalAfter.toString())
        assert.equal(BigNumber(arbiterBalBefore).plus(fee).toString(), arbiterBalAfter.toString())
        assert.equal(borBalBefore.toString(), borBalAfter.toString())

        const accepted = await this.sales.accepted.call(this.sale)
        assert.equal(accepted, true)
      })

      it('should disperse funds to lender, arbiter, and medianizer if there is enough funds for owedToLender, fee and penalty but not enough for borrower', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('200', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).minus(BigNumber(owedForLoan).dividedBy(2).toFixed(0)).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, repaid, owedToLender, fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender - fee - penalty = 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender + fee + penalty) / (medValue * 0.93 * collateral * BTC_TO_SAT)

        const num = BigNumber(repaid).times(-1).plus(owedToLender).plus(fee).plus(penalty)
        const den = BigNumber(medValue).times(0.93).times(collateral).dividedBy(BTC_TO_SAT)
        const x = BigNumber(num).times(multiplier).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(30)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('200', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const { lendBalBefore, borBalBefore, arbiterBalBefore, medBalBefore, fundBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])
        const { lendBalAfter, borBalAfter, arbiterBalAfter, medBalAfter, fundBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)

        assert.equal(BigNumber(fundBalBefore).plus(owedToLender).dividedBy(divisor).toFixed(precision), BigNumber(fundBalAfter).dividedBy(divisor).toFixed(precision))
        assert.equal(BigNumber(medBalBefore).plus(penalty).toFixed(), medBalAfter.toString())
        assert.equal(BigNumber(arbiterBalBefore).plus(fee).toFixed(), arbiterBalAfter.toString())
        assert.equal(BigNumber(borBalBefore).toFixed(), borBalAfter.toString())

        const accepted = await this.sales.accepted.call(this.sale)
        assert.equal(accepted, true)
      })

      it('should disperse funds to rightful parties after partial repayment using provideSecretsAndAccept function', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateralValue, minCollateralValue, repaid, owedToLender } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        await this.med.poke(numToBytes32(BigNumber(minCollateralValue).dividedBy(collateralValue).times(hexToNumberString(medValue)).times(0.99).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const { lendBalBefore, borBalBefore, arbiterBalBefore, fundBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)

        await this.sales.provideSecretsAndAccept(this.sale, [ lendSecs[1], borSecs[1], liquidatorSecs[0] ])

        const { lendBalAfter, borBalAfter, arbiterBalAfter, fundBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)
        const { fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const discountBuy = await this.sales.discountBuy.call(this.sale)

        assert.equal(BigNumber(fundBalBefore).plus(owedToLender).toFixed(), fundBalAfter.toString())
        assert.equal(BigNumber(borBalBefore).plus(BigNumber(discountBuy).plus(repaid).minus(owedForLiquidation)).toFixed(), borBalAfter.toString())
        assert.equal(BigNumber(arbiterBalBefore).plus(fee).toFixed(), arbiterBalAfter)

        const accepted = await this.sales.accepted.call(this.sale)
        assert.equal(accepted, true)
      })

      it('should fail if accepted', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateralValue, minCollateralValue, repaid, owedToLender } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        await this.med.poke(numToBytes32(BigNumber(minCollateralValue).dividedBy(collateralValue).times(hexToNumberString(medValue)).times(0.99).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await this.sales.provideSecretsAndAccept(this.sale, [ lendSecs[1], borSecs[1], liquidatorSecs[0] ])

        await expectRevert(this.sales.accept(this.sale), 'VM Exception while processing transaction: revert')
      })

      it('should fail if off', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateralValue, minCollateralValue, repaid, owedToLender } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        await this.med.poke(numToBytes32(BigNumber(minCollateralValue).dividedBy(collateralValue).times(hexToNumberString(medValue)).times(0.99).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await increaseTime(toSecs({ days: 1 }))

        await this.sales.refund(this.sale)

        await expectRevert(this.sales.accept(this.sale), 'VM Exception while processing transaction: revert')
      })

      it('should fail if hasSecrets is false', async function() {
        lendSecs = []
        lendSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          lendSecs.push(ensure0x(sec))
          lendSechs.push(ensure0x(sha256(sec)))
        }

        borSecs = []
        borSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          borSecs.push(ensure0x(sec))
          borSechs.push(ensure0x(sha256(sec)))
        }

        liquidatorSecs = []
        liquidatorSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          liquidatorSecs.push(ensure0x(sec))
          liquidatorSechs.push(ensure0x(sha256(sec)))
        }

        // Pull from loan
        const loanParams = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 2}),
          ~~(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        this.loan = await this.funds.request.call(...loanParams)
        await this.funds.request(...loanParams)
        await this.loans.approve(this.loan)
        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await expectRevert(this.sales.accept(this.sale), 'VM Exception while processing transaction: revert')
      })

      it('should fail if secret D is not revealed', async function() {
        lendSecs = []
        lendSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          lendSecs.push(ensure0x(sec))
          lendSechs.push(ensure0x(sha256(sec)))
        }

        borSecs = []
        borSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          borSecs.push(ensure0x(sec))
          borSechs.push(ensure0x(sha256(sec)))
        }

        liquidatorSecs = []
        liquidatorSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          liquidatorSecs.push(ensure0x(sec))
          liquidatorSechs.push(ensure0x(sha256(sec)))
        }

        // Pull from loan
        const loanParams = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 2}),
          ~~(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        this.loan = await this.funds.request.call(...loanParams)
        await this.funds.request(...loanParams)
        await this.loans.approve(this.loan)
        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await this.sales.provideSecret(this.sale, lendSecs[1])
        await this.sales.provideSecret(this.sale, borSecs[1])

        await expectRevert(this.sales.accept(this.sale), 'VM Exception while processing transaction: revert')
      })
    })

    describe('provideSig', function() {
      it('should allow parties to sign and retrieve their signatures', async function() {
        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await this.sales.provideSig(this.sale, sig1, sig2, { from: borrower })
        await this.sales.provideSig(this.sale, sig3, sig4, { from: lender })
        await this.sales.provideSig(this.sale, sig5, sig6, { from: arbiter })

        const bsigs = await this.sales.borrowerSigs.call(this.sale)
        const lsigs = await this.sales.lenderSigs.call(this.sale)
        const asigs = await this.sales.arbiterSigs.call(this.sale)

        assert.equal(bsigs[0], sig1)
        assert.equal(bsigs[1], sig2)

        assert.equal(lsigs[0], sig3)
        assert.equal(lsigs[1], sig4)

        assert.equal(asigs[0], sig5)
        assert.equal(asigs[1], sig6)

        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])

        const accepted = await this.sales.accepted.call(this.sale)
        assert.equal(accepted, true)
      })

      it('should fail providing signature for incorrect sale', async function() {
        await expectRevert(this.sales.provideSig(numToBytes32(0), sig1, sig2, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if msg.sender isn\'t borrower, lender, or arbiter', async function() {
        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await expectRevert(this.sales.provideSig(this.sale, sig1, sig2, { from: liquidator }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if current time is greater than settlementExpiration', async function() {
        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await increaseTime(toSecs({ days: 30 }))

        await expectRevert(this.sales.provideSig(this.sale, sig1, sig2, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if refundableSig is null', async function() {
        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await expectRevert(this.sales.provideSig(this.sale, ensure0x(''), sig2, { from: borrower }), 'VM Exception while processing transaction: revert')
      })

      it('should fail if seizableSig is null', async function() {
        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await expectRevert(this.sales.provideSig(this.sale, sig1, ensure0x(''), { from: borrower }), 'VM Exception while processing transaction: revert')
      })
    })

    describe('hasSecrets', function() {
      it('should return 0 if no secrets provided', async function() {
        lendSecs = []
        lendSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          lendSecs.push(ensure0x(sec))
          lendSechs.push(ensure0x(sha256(sec)))
        }

        borSecs = []
        borSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          borSecs.push(ensure0x(sec))
          borSechs.push(ensure0x(sha256(sec)))
        }

        liquidatorSecs = []
        liquidatorSechs = []
        for (let i = 0; i < 4; i++) {
          let sec = sha256(Math.random().toString())
          liquidatorSecs.push(ensure0x(sec))
          liquidatorSechs.push(ensure0x(sha256(sec)))
        }

        // Pull from loan
        const loanParams = [
          this.fund,
          borrower,
          toWei(loanReq.toString(), unit),
          col,
          toSecs({days: 2}),
          ~~(Date.now() / 1000),
          [ ...borSechs, ...lendSechs ],
          ensure0x(borpubk),
          ensure0x(lendpubk)
        ]

        await this.funds.generate(arbiterSechs, { from: arbiter })

        // Push funds to loan fund
        await this.token.approve(this.funds.address, toWei('100', unit))
        await this.funds.deposit(this.fund, toWei('100', unit))

        this.loan = await this.funds.request.call(...loanParams)
        await this.funds.request(...loanParams)
        await this.loans.approve(this.loan)
        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

        await this.med.poke(numToBytes32(toWei((btcPrice * 0.7).toString(), 'ether')))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const hasSecrets = await this.sales.hasSecrets(this.sale)

        assert.equal(hasSecrets, false)
      })
    })

    describe('refund', function() {
      it('should refund if not off, not accepted, current time greater than settlementExpiration and discountBuy set', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, repaid, owedToLender, fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender - fee - penalty = 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender + fee + penalty) / (medValue * 0.93 * collateral * BTC_TO_SAT)

        const num = BigNumber(minCollateralValue).times(0.98)
        const den = BigNumber(collateralValue)
        const x = BigNumber(num).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(25)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const discountBuy = await this.sales.discountBuy.call(this.sale)

        await increaseTime(toSecs({ hours: 4, minutes: 2 }))

        const balBefore = await this.token.balanceOf.call(liquidator)
        const { borBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)

        await this.sales.refund(this.sale)

        const balAfter = await this.token.balanceOf.call(liquidator)
        const { borBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)

        assert.equal(BigNumber(balBefore).plus(discountBuy).toFixed(), balAfter.toString())
        assert.equal(borBalBefore.toString(), borBalAfter.toString())
      })

      it('should refund borrower repaid amount after 3rd liquidation attempt', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, repaid, owedToLender, fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender - fee - penalty = 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender + fee + penalty) / (medValue * 0.93 * collateral * BTC_TO_SAT)

        const num = BigNumber(minCollateralValue).times(0.98)
        const den = BigNumber(collateralValue)
        const x = BigNumber(num).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(25)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        await increaseTime(toSecs({ hours: 4, minutes: 2 }))

        await this.sales.refund(this.sale)

        await approveAndTransfer(this.token, liquidator2, this.loans, toWei('50', unit))
        this.sale2 = await liquidate(this.loans, this.loan, liquidatorSechs[1], liquidatorpbkh, liquidator2)

        await increaseTime(toSecs({ hours: 4, minutes: 2 }))

        await this.sales.refund(this.sale2)

        await approveAndTransfer(this.token, liquidator3, this.loans, toWei('50', unit))
        this.sale3 = await liquidate(this.loans, this.loan, liquidatorSechs[2], liquidatorpbkh, liquidator3)

        await increaseTime(toSecs({ hours: 4, minutes: 2 }))

        const balBefore = await this.token.balanceOf.call(liquidator3)
        const { borBalBefore } = await getBalancesBefore(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)

        await this.sales.refund(this.sale3)

        const balAfter = await this.token.balanceOf.call(liquidator3)
        const { borBalAfter } = await getBalancesAfter(this.token, lender, borrower, arbiter, this.med.address, this.funds.address)

        const discountBuy = await this.sales.discountBuy.call(this.sale)

        assert.equal(BigNumber(balBefore).plus(discountBuy).toFixed(), balAfter.toString())
        assert.equal(BigNumber(borBalBefore).plus(repaid).toFixed(), borBalAfter.toString())
      })

      it('should fail refunding if already refunded', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, repaid, owedToLender, fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender - fee - penalty = 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender + fee + penalty) / (medValue * 0.93 * collateral * BTC_TO_SAT)

        const num = BigNumber(minCollateralValue).times(0.98)
        const den = BigNumber(collateralValue)
        const x = BigNumber(num).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(25)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const discountBuy = await this.sales.discountBuy.call(this.sale)

        await increaseTime(toSecs({ hours: 4, minutes: 2 }))

        await this.sales.refund(this.sale)

        await increaseTime(toSecs({ minutes: 2 }))

        await expectRevert(this.sales.refund(this.sale), 'VM Exception while processing transaction: revert')
      })

      it('should fail refunding if current time before settlement expiration', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, repaid, owedToLender, fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender - fee - penalty = 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender + fee + penalty) / (medValue * 0.93 * collateral * BTC_TO_SAT)

        const num = BigNumber(minCollateralValue).times(0.98)
        const den = BigNumber(collateralValue)
        const x = BigNumber(num).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(25)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const discountBuy = await this.sales.discountBuy.call(this.sale)

        await increaseTime(toSecs({ hours: 3, minutes: 59 }))

        await expectRevert(this.sales.refund(this.sale), 'VM Exception while processing transaction: revert')
      })

      it('should fail refunding if discountBuy already accepted', async function() {
        await approveAndTransfer(this.token, borrower, this.loans, toWei('50', unit))

        const owedForLoan = await this.loans.owedForLoan.call(this.loan)
        await this.loans.repay(this.loan, BigNumber(owedForLoan).dividedBy(2).toFixed(0), { from: borrower })

        const { collateral, collateralValue, minCollateralValue, repaid, owedToLender, fee, penalty, owedForLiquidation } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()

        // discountBuy + repaid - owedToLender - fee - penalty = 0
        // discountBuy = medValue * x * 0.93 * collateral
        // x = (-repaid + owedToLender + fee + penalty) / (medValue * 0.93 * collateral * BTC_TO_SAT)

        const num = BigNumber(minCollateralValue).times(0.98)
        const den = BigNumber(collateralValue)
        const x = BigNumber(num).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(25)).toFixed(0)))

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('50', unit))
        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const discountBuy = await this.sales.discountBuy.call(this.sale)

        await increaseTime(toSecs({ hours: 3, minutes: 59 }))

        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])

        await expectRevert(this.sales.refund(this.sale), 'VM Exception while processing transaction: revert')
      })

      it('should fail if discountBuy is 0', async function() {
        await expectRevert(this.sales.refund(numToBytes32(0)), 'VM Exception while processing transaction: revert')
      })
    })

    describe('provideSecret', function() {
      it('should fail if sale not set', async function() {
        await expectRevert(this.sales.provideSecret(numToBytes32(0), numToBytes32(0)), 'VM Exception while processing transaction: revert')
      })
    })
  })
})
