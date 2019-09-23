const bitcoinjs = require('bitcoinjs-lib')
const { bitcoin } = require('./helpers/collateral/common.js')
const config = require('./helpers/collateral/config.js')

const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256, hash160 }    = require('@liquality/crypto')
const { ensure0x, remove0x }  = require('@liquality/ethereum-utils');
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
const { toWei, fromWei, hexToNumberString } = web3.utils;

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

async function approveAndTransfer(token, spender, contract, amount) {
  await token.transfer(spender, amount)
  await token.approve(contract.address, amount, { from: spender })
}

async function getUnusedPubKeyAndAddress () {
  const address = (await bitcoin.client.getMethod('getNewAddress')('bech32')).address
  let wif = await bitcoin.client.getMethod('dumpPrivKey')(address)
  const wallet = bitcoinjs.ECPair.fromWIF(wif, bitcoinjs.networks.regtest)
  return { address, pubKey: wallet.publicKey }
}

async function provideSecretsAndAccept(contract, instance, sec1, sec2, sec3) {
  await contract.provideSecret(instance, sec1)
  await contract.provideSecret(instance, sec2)
  await contract.provideSecret(instance, sec3)
  await contract.accept(instance)
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
  const owedForLoan = await contract.owedForLoan.call(instance)
  const safe = await contract.safe.call(instance)

  return { collateral, collateralValue, minCollateralValue, owedToLender, fee, penalty, repaid, owedForLiquidation, owedForLoan, safe }
}

function getCollateralSatAmounts(collateralValue, owedToLender, btcPrice, unit) {
  const seizableValue = Math.ceil(BigNumber(fromWei(owedToLender.toString(), unit)).dividedBy(btcPrice).times(BTC_TO_SAT).toString())
  const refundableValue = parseInt(collateralValue.toString()) - seizableValue
  return { refundableValue, seizableValue }
}

async function getPubKeys(contract, instance) {
  let { borrowerPubKey, lenderPubKey, arbiterPubKey } = await contract.pubKeys.call(instance)
  borrowerPubKey = remove0x(borrowerPubKey)
  lenderPubKey = remove0x(lenderPubKey)
  arbiterPubKey = remove0x(arbiterPubKey)

  return { borrowerPubKey, lenderPubKey, arbiterPubKey }
}

async function getSecretHashes(contract, instance) {
  let { secretHashA1, secretHashB1, secretHashC1 } = await contract.secretHashes.call(instance)
  secretHashA1 = remove0x(secretHashA1)
  secretHashB1 = remove0x(secretHashB1)
  secretHashC1 = remove0x(secretHashC1)

  return { secretHashA1, secretHashB1, secretHashC1 }
}

async function getSwapSecretHashes(contract, instance) {
  let { secretHashA, secretHashB, secretHashC, secretHashD } = await contract.secretHashes.call(instance)
  secretHashA1 = remove0x(secretHashA)
  secretHashB1 = remove0x(secretHashB)
  secretHashC1 = remove0x(secretHashC)
  secretHashD1 = remove0x(secretHashD)

  return { secretHashA1, secretHashB1, secretHashC1, secretHashD1 }
}

async function getExpirations(contract, instance) {
  const approveExpiration = parseInt(remove0x((await contract.approveExpiration.call(instance)).toString()))
  const liquidationExpiration = parseInt(remove0x((await contract.liquidationExpiration.call(instance)).toString()))
  const seizureExpiration = parseInt(remove0x((await contract.seizureExpiration.call(instance)).toString()))

  return { approveExpiration, liquidationExpiration, seizureExpiration }
}

async function getCollateralParams(collateralSatValues, contract, instance) {
  const values = getCollateralSatAmounts(...collateralSatValues)
  const pubKeys = await getPubKeys(contract, instance)
  const secretHashes = await getSecretHashes(contract, instance)
  const expirations = await getExpirations(contract, instance)

  return { values, pubKeys, secretHashes, expirations }
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

function getVinRedeemScript (vin) {
  if (vin.txinwitness == undefined) {
    return vin.scriptSig.hex
  } else {
    return vin.txinwitness
  }
}

async function liquidate(contract, instance, secretHash, pubKeyHash, liquidator) {
  const sale = await contract.liquidate.call(instance, secretHash, ensure0x(pubKeyHash), { from: liquidator })
  await contract.liquidate(instance, secretHash, ensure0x(pubKeyHash), { from: liquidator })
  return sale
}

async function getSwapSecrets(contract, instance) {
  let { secretA, secretB, secretC, secretD } = await contract.secretHashes.call(instance)
  secretA1 = remove0x(secretA)
  secretB1 = remove0x(secretB)
  secretC1 = remove0x(secretC)
  secretD1 = remove0x(secretD)

  return { secretA1, secretB1, secretC1, secretD1 }
}

stablecoins.forEach((stablecoin) => {
  const { name, unit } = stablecoin

  contract(`${name} End to end (BTC/ETH)`, accounts => {
    const lender = accounts[0]
    const borrower = accounts[1]
    const arbiter = accounts[2]
    const liquidator = accounts[3]
    const liquidator2 = accounts[4]
    const liquidator3 = accounts[5]

    let lenderBTC, borrowerBTC, arbiterBTC

    let currentTime
    let btcPrice

    const loanReq = 10; // 5 DAI
    const loanRat = 2; // Collateralization ratio of 200%
    let col;

    let lendSecs = []
    let lendSechs = []
    for (let i = 0; i < 4; i++) {
      let sec = sha256(Math.random().toString())
      lendSecs.push(ensure0x(sec))
      lendSechs.push(ensure0x(sha256(sec)))
    }

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

      lenderBTC = await getUnusedPubKeyAndAddress()
      borrowerBTC = await getUnusedPubKeyAndAddress()
      arbiterBTC = await getUnusedPubKeyAndAddress()
      liquidatorBTC = await getUnusedPubKeyAndAddress()
      liquidatorBTC2 = await getUnusedPubKeyAndAddress()
      liquidatorBTC3 = await getUnusedPubKeyAndAddress()

      liquidatorBTC.pubKeyhash = hash160(liquidatorBTC.pubKey)
      liquidatorBTC2.pubKeyHash = hash160(liquidatorBTC2.pubKey)
      liquidatorBTC3.pubKeyHash = hash160(liquidatorBTC3.pubKey)

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
      await this.funds.setPubKey(ensure0x(arbiterBTC.pubKey), { from: arbiter })

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', unit))
      await this.funds.deposit(this.fund, toWei('100', unit))

      const loanParams = [
        this.fund,
        borrower,
        toWei(loanReq.toString(), unit),
        col,
        toSecs({days: 2}),
        Math.floor(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borrowerBTC.pubKey.toString('hex')),
        ensure0x(lenderBTC.pubKey.toString('hex'))
      ]

      this.loan = await this.funds.request.call(...loanParams)
      await this.funds.request(...loanParams)
    })

    describe('Regular loan flow with repayment before loanExpiration', function() {
      it('should request, lock, approve, withdraw, repay, accept, unlock', async function() {
        const { owedToLender, owedForLoan, collateral } = await getLoanValues(this.loans, this.loan)
        const collateralSatValues = [collateral, owedToLender, btcPrice, unit]

        const values = getCollateralSatAmounts(collateral, owedToLender, btcPrice, unit);
        assert.equal((values.refundableValue + values.seizableValue), col)

        const colParams = await getCollateralParams(collateralSatValues, this.loans, this.loan)
        const lockParams = [colParams.values, colParams.pubKeys, colParams.secretHashes, colParams.expirations]

        const lockTxHash = await bitcoin.client.loan.collateral.lock(...lockParams)

        await bitcoin.client.chain.generateBlock(1)

        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower }) // SECRET A1 IS NOW GLOBAL

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await increaseTime(toSecs({ days: 1, hours: 23 }))

        await this.token.approve(this.loans.address, toWei('100', unit), { from: borrower })
        await this.loans.repay(this.loan, owedForLoan, { from: borrower })

        await this.loans.accept(this.loan, lendSecs[0]) // SECRET B1 IS NOW GLOBAL

        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)

        const borBTCBalanceBefore = await bitcoin.client.chain.getBalance(borrowerBTC.address)

        const refundParams = [lockTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundTxHash = await bitcoin.client.loan.collateral.refund(...refundParams)

        const borBTCBalanceAfter = await bitcoin.client.chain.getBalance(borrowerBTC.address)

        assert.isAbove(parseInt(BigNumber(borBTCBalanceAfter).toFixed(0)), parseInt(BigNumber(borBTCBalanceBefore).plus(col).times(0.9).toFixed(0)))

        const refundTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(refundTxHash)
        const refundTx = await bitcoin.client.getMethod('decodeRawTransaction')(refundTxRaw)

        const refundVouts = refundTx._raw.data.vout
        const refundVins = refundTx._raw.data.vin

        expect(refundVins.length).to.equal(2)
        expect(refundVouts.length).to.equal(1)

        expect(getVinRedeemScript(refundVins[0]).includes(remove0x(acceptSecret))).to.equal(true)
        expect(getVinRedeemScript(refundVins[1]).includes(remove0x(acceptSecret))).to.equal(true)
      })
    })

    describe('Liquidation when below 140% collateralization', function() {
      it('should request, lock, approve, withdraw, liquidate, accept, claim', async function() {
        const { owedToLender, owedForLoan, collateral, minCollateralValue, collateralValue } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()
        const collateralSatValues = [collateral, owedToLender, btcPrice, unit]

        const values = getCollateralSatAmounts(collateral, owedToLender, btcPrice, unit);
        assert.equal((values.refundableValue + values.seizableValue), col)

        const colParams = await getCollateralParams(collateralSatValues, this.loans, this.loan)

        const lockParams = [colParams.values, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockTxHash = await bitcoin.client.loan.collateral.lock(...lockParams)

        await bitcoin.client.chain.generateBlock(1)

        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower }) // SECRET A1 IS NOW GLOBAL

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await increaseTime(toSecs({ days: 1 }))

        // liquidation price < (minCollateralValues / collateralValue) * current medianizer price
        const num = BigNumber(minCollateralValue).times(0.96) // * 0.99 to make it slighlty less than 140% collateralization
        const den = BigNumber(collateralValue)
        const x = BigNumber(num).dividedBy(den)

        await this.med.poke(numToBytes32(BigNumber(hexToNumberString(medValue)).times(x.toPrecision(25)).toFixed(0)))

        colParams.pubKeys.liquidatorPubKey = liquidatorBTC.pubKey
        colParams.pubKeys.liquidatorPubKeyHash = hash160(liquidatorBTC.pubKey)

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('100', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], hash160(liquidatorBTC.pubKey), liquidator)

        const swapSecretHashes = await getSwapSecretHashes(this.sales, this.sale)

        const swapParams = [colParams.pubKeys, swapSecretHashes, colParams.expirations]
        const lockAddresses = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams)

        const outputs = [{ address: lockAddresses.refundableAddress }, { address: lockAddresses.seizableAddress }]

        const multisigBorrowerParams = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'borrower', outputs]
        const borrowerSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigBorrowerParams)

        const multisigParamsLender = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'lender', outputs]
        const lenderSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigParamsLender)

        const sigs = {
          refundable: [Buffer.from(borrowerSigs.refundableSig, 'hex'), Buffer.from(lenderSigs.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs.seizableSig, 'hex'), Buffer.from(lenderSigs.seizableSig, 'hex')]
        }

        const multisigSendTxHash = await bitcoin.client.loan.collateral.multisigSend(lockTxHash, sigs, colParams.pubKeys, colParams.secretHashes, colParams.expirations, outputs)

        await bitcoin.client.chain.generateBlock(1)

        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])
        const { secretA1, secretB1, secretC1, secretD1 } = await getSwapSecrets(this.sales, this.sale)

        const claimParams = [multisigSendTxHash, colParams.pubKeys, [secretA1, secretB1, secretD1], swapSecretHashes, colParams.expirations]
        const claimTxHash = await bitcoin.client.loan.collateralSwap.claim(...claimParams)

        const claimTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(claimTxHash)
        const claimTx = await bitcoin.client.getMethod('decodeRawTransaction')(claimTxRaw)

        const claimVouts = claimTx._raw.data.vout
        const claimVins = claimTx._raw.data.vin

        expect(claimVins.length).to.equal(2)
        expect(claimVouts.length).to.equal(1)

        expect(getVinRedeemScript(claimVins[0]).includes(remove0x(secretA1))).to.equal(true)
        expect(getVinRedeemScript(claimVins[1]).includes(remove0x(secretA1))).to.equal(true)
      })
    })

    describe('Liquidation on default', function() {
      it('should request, lock, approve, withdraw, wait until loanExpiration, liquidate, accept, claim', async function() {
        const { owedToLender, owedForLoan, collateral, minCollateralValue, collateralValue } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()
        const collateralSatValues = [collateral, owedToLender, btcPrice, unit]

        const values = getCollateralSatAmounts(collateral, owedToLender, btcPrice, unit);
        assert.equal((values.refundableValue + values.seizableValue), col)

        const colParams = await getCollateralParams(collateralSatValues, this.loans, this.loan)

        const lockParams = [colParams.values, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockTxHash = await bitcoin.client.loan.collateral.lock(...lockParams)

        await bitcoin.client.chain.generateBlock(1)

        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower }) // SECRET A1 IS NOW GLOBAL

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await increaseTime(toSecs({ days: 2, minutes: 5 }))

        colParams.pubKeys.liquidatorPubKey = liquidatorBTC.pubKey
        colParams.pubKeys.liquidatorPubKeyHash = hash160(liquidatorBTC.pubKey)

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('100', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], hash160(liquidatorBTC.pubKey), liquidator)

        const swapSecretHashes = await getSwapSecretHashes(this.sales, this.sale)

        const swapParams = [colParams.pubKeys, swapSecretHashes, colParams.expirations]
        const lockAddresses = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams)

        const outputs = [{ address: lockAddresses.refundableAddress }, { address: lockAddresses.seizableAddress }]

        const multisigBorrowerParams = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'borrower', outputs]
        const borrowerSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigBorrowerParams)

        const multisigParamsLender = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'lender', outputs]
        const lenderSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigParamsLender)

        const sigs = {
          refundable: [Buffer.from(borrowerSigs.refundableSig, 'hex'), Buffer.from(lenderSigs.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs.seizableSig, 'hex'), Buffer.from(lenderSigs.seizableSig, 'hex')]
        }

        const multisigSendTxHash = await bitcoin.client.loan.collateral.multisigSend(lockTxHash, sigs, colParams.pubKeys, colParams.secretHashes, colParams.expirations, outputs)

        await bitcoin.client.chain.generateBlock(1)

        await provideSecretsAndAccept(this.sales, this.sale, lendSecs[1], borSecs[1], liquidatorSecs[0])
        const { secretA1, secretB1, secretC1, secretD1 } = await getSwapSecrets(this.sales, this.sale)

        const claimParams = [multisigSendTxHash, colParams.pubKeys, [secretA1, secretB1, secretD1], swapSecretHashes, colParams.expirations]
        const claimTxHash = await bitcoin.client.loan.collateralSwap.claim(...claimParams)

        const claimTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(claimTxHash)
        const claimTx = await bitcoin.client.getMethod('decodeRawTransaction')(claimTxRaw)

        const claimVouts = claimTx._raw.data.vout
        const claimVins = claimTx._raw.data.vin

        expect(claimVins.length).to.equal(2)
        expect(claimVouts.length).to.equal(1)

        expect(getVinRedeemScript(claimVins[0]).includes(remove0x(secretA1))).to.equal(true)
        expect(getVinRedeemScript(claimVins[1]).includes(remove0x(secretA1))).to.equal(true)
      })
    })

    describe('2 failed liquidations then claim', function() {
      it('should request, lock, approve, withdraw, wait until loanExpiration, liquidate, liquidate, liquidate, accept, claim', async function() {
        const { owedToLender, owedForLoan, collateral, minCollateralValue, collateralValue } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()
        const collateralSatValues = [collateral, owedToLender, btcPrice, unit]

        const values = getCollateralSatAmounts(collateral, owedToLender, btcPrice, unit);
        assert.equal((values.refundableValue + values.seizableValue), col)

        const colParams = await getCollateralParams(collateralSatValues, this.loans, this.loan)

        const lockParams = [colParams.values, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockTxHash = await bitcoin.client.loan.collateral.lock(...lockParams)

        await bitcoin.client.chain.generateBlock(1)

        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower }) // SECRET A1 IS NOW GLOBAL

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await increaseTime(toSecs({ days: 2, minutes: 5 }))

        colParams.pubKeys.liquidatorPubKey = liquidatorBTC.pubKey
        colParams.pubKeys.liquidatorPubKeyHash = hash160(liquidatorBTC.pubKey)

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('100', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], hash160(liquidatorBTC.pubKey), liquidator) // SECRETHASH D1 IS SET
        
        const swapSecretHashes = await getSwapSecretHashes(this.sales, this.sale)

        const { approveExpiration, liquidationExpiration, seizureExpiration } = colParams.expirations
        const swapExpiration = parseInt(remove0x(await this.sales.swapExpiration(this.sale)).toString())
        const swapExpirations = { approveExpiration, liquidationExpiration, seizureExpiration, swapExpiration }

        const swapParams = [colParams.pubKeys, swapSecretHashes, swapExpirations]
        const lockAddresses = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams)

        const outputs = [{ address: lockAddresses.refundableAddress }, { address: lockAddresses.seizableAddress }]

        const multisigBorrowerParams = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'borrower', outputs]
        const borrowerSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigBorrowerParams)

        const multisigParamsLender = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'lender', outputs]
        const lenderSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigParamsLender)

        const sigs = {
          refundable: [Buffer.from(borrowerSigs.refundableSig, 'hex'), Buffer.from(lenderSigs.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs.seizableSig, 'hex'), Buffer.from(lenderSigs.seizableSig, 'hex')]
        }

        const multisigSendTxHash = await bitcoin.client.loan.collateral.multisigSend(lockTxHash, sigs, colParams.pubKeys, colParams.secretHashes, colParams.expirations, outputs)

        await bitcoin.client.chain.generateBlock(1)

        await this.sales.provideSecret(this.sale, lendSecs[1]) // SECRET B2 IS NOW GLOBAL
        await this.sales.provideSecret(this.sale, borSecs[1])  // SECRET A2 IS NOW GLOBAL

        await increaseTime(toSecs({ hours: 4, minutes: 1 }))
        await this.sales.refund(this.sale, { from: liquidator })

        await approveAndTransfer(this.token, liquidator2, this.loans, toWei('100', unit))
        this.sale2 = await liquidate(this.loans, this.loan, liquidatorSechs[1], hash160(liquidatorBTC2.pubKey), liquidator2) // SECRETHASH D2 IS SET
        
        const swapSecretHashes2 = await getSwapSecretHashes(this.sales, this.sale2)

        const swapExpiration2 = parseInt(remove0x(await this.sales.swapExpiration(this.sale2)).toString())
        const swapExpirations2 = { approveExpiration, liquidationExpiration, seizureExpiration, swapExpiration: swapExpiration2 }

        const swapParams2 = [colParams.pubKeys, swapSecretHashes2, swapExpirations2]
        const lockAddresses2 = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams2)

        const outputs2 = [{ address: lockAddresses2.refundableAddress }, { address: lockAddresses2.seizableAddress }]

        const multisigBorrowerParams2 = [multisigSendTxHash, colParams.pubKeys, swapSecretHashes, swapExpirations, 'borrower', outputs2]
        const borrowerSigs2 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigBorrowerParams2)

        const multisigParamsLender2 = [multisigSendTxHash, colParams.pubKeys, swapSecretHashes, swapExpirations, 'lender', outputs2]
        const lenderSigs2 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigParamsLender2)

        const sigs2 = {
          refundable: [Buffer.from(borrowerSigs2.refundableSig, 'hex'), Buffer.from(lenderSigs2.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs2.seizableSig, 'hex'), Buffer.from(lenderSigs2.seizableSig, 'hex')]
        }

        const multisigMoveTxHash = await bitcoin.client.loan.collateralSwap.multisigMove(multisigSendTxHash, sigs2, colParams.pubKeys, swapSecretHashes, swapExpirations, outputs2)

        await bitcoin.client.chain.generateBlock(1)

        await increaseTime(toSecs({ hours: 4, minutes: 1 }))
        await this.sales.refund(this.sale2, { from: liquidator2 })

        await approveAndTransfer(this.token, liquidator3, this.loans, toWei('100', unit))
        this.sale3 = await liquidate(this.loans, this.loan, liquidatorSechs[2], hash160(liquidatorBTC3.pubKey), liquidator3) // SECRETHASH D3 IS SET

        const swapSecretHashes3 = await getSwapSecretHashes(this.sales, this.sale3)

        const swapExpiration3 = parseInt(remove0x(await this.sales.swapExpiration(this.sale3)).toString())
        const swapExpirations3 = { approveExpiration, liquidationExpiration, seizureExpiration, swapExpiration: swapExpiration3 }

        const swapParams3 = [colParams.pubKeys, swapSecretHashes3, swapExpirations3]
        const lockAddresses3 = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams3)

        const outputs3 = [{ address: lockAddresses3.refundableAddress }, { address: lockAddresses3.seizableAddress }]

        const multisigBorrowerParams3 = [multisigMoveTxHash, colParams.pubKeys, swapSecretHashes2, swapExpirations2, 'borrower', outputs3]
        const borrowerSigs3 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigBorrowerParams3)

        const multisigParamsLender3 = [multisigMoveTxHash, colParams.pubKeys, swapSecretHashes2, swapExpirations2, 'lender', outputs3]
        const lenderSigs3 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigParamsLender3)

        const sigs3 = {
          refundable: [Buffer.from(borrowerSigs3.refundableSig, 'hex'), Buffer.from(lenderSigs3.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs3.seizableSig, 'hex'), Buffer.from(lenderSigs3.seizableSig, 'hex')]
        }

        const multisigMoveTxHash2 = await bitcoin.client.loan.collateralSwap.multisigMove(multisigMoveTxHash, sigs3, colParams.pubKeys, swapSecretHashes2, swapExpirations2, outputs3)

        await provideSecretsAndAccept(this.sales, this.sale3, lendSecs[3], borSecs[3], liquidatorSecs[2])
        const { secretA1, secretB1, secretC1, secretD1 } = await getSwapSecrets(this.sales, this.sale3)

        const claimParams = [multisigMoveTxHash2, colParams.pubKeys, [secretA1, secretB1, secretD1], swapSecretHashes3, swapExpirations3]
        const claimTxHash = await bitcoin.client.loan.collateralSwap.claim(...claimParams)

        const claimTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(claimTxHash)
        const claimTx = await bitcoin.client.getMethod('decodeRawTransaction')(claimTxRaw)

        const claimVouts = claimTx._raw.data.vout
        const claimVins = claimTx._raw.data.vin

        expect(claimVins.length).to.equal(2)
        expect(claimVouts.length).to.equal(1)

        expect(getVinRedeemScript(claimVins[0]).includes(remove0x(secretA1))).to.equal(true)
        expect(getVinRedeemScript(claimVins[1]).includes(remove0x(secretA1))).to.equal(true)
      })
    })

    describe('Seize after liquidation', function() {
      it('should request, lock, approve, withdraw, wait until loanExpiration, liquidate, liquidate, liquidate, accept, claim', async function() {
        const { owedToLender, owedForLoan, collateral, minCollateralValue, collateralValue } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()
        const collateralSatValues = [collateral, owedToLender, btcPrice, unit]

        const values = getCollateralSatAmounts(collateral, owedToLender, btcPrice, unit);
        assert.equal((values.refundableValue + values.seizableValue), col)

        const colParams = await getCollateralParams(collateralSatValues, this.loans, this.loan)

        const lockParams = [colParams.values, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockTxHash = await bitcoin.client.loan.collateral.lock(...lockParams)

        await bitcoin.client.chain.generateBlock(1)

        await this.loans.approve(this.loan)

        await this.loans.withdraw(this.loan, borSecs[0], { from: borrower }) // SECRET A1 IS NOW GLOBAL

        // Send funds to borrower so they can repay full
        await this.token.transfer(borrower, toWei('1', unit))

        await increaseTime(toSecs({ days: 2, minutes: 5 }))

        colParams.pubKeys.liquidatorPubKey = liquidatorBTC.pubKey
        colParams.pubKeys.liquidatorPubKeyHash = hash160(liquidatorBTC.pubKey)

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('100', unit))

        this.sale = await liquidate(this.loans, this.loan, liquidatorSechs[0], hash160(liquidatorBTC.pubKey), liquidator) // SECRETHASH D1 IS SET
        
        const swapSecretHashes = await getSwapSecretHashes(this.sales, this.sale)

        const { approveExpiration, liquidationExpiration, seizureExpiration } = colParams.expirations
        const swapExpiration = parseInt(remove0x(await this.sales.swapExpiration(this.sale)).toString())
        const swapExpirations = { approveExpiration, liquidationExpiration, seizureExpiration, swapExpiration }

        const swapParams = [colParams.pubKeys, swapSecretHashes, swapExpirations]
        const lockAddresses = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams)

        const outputs = [{ address: lockAddresses.refundableAddress }, { address: lockAddresses.seizableAddress }]

        const multisigBorrowerParams = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'borrower', outputs]
        const borrowerSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigBorrowerParams)

        const multisigParamsLender = [lockTxHash, colParams.pubKeys, colParams.secretHashes, colParams.expirations, 'lender', outputs]
        const lenderSigs = await bitcoin.client.loan.collateral.multisigSign(...multisigParamsLender)

        const sigs = {
          refundable: [Buffer.from(borrowerSigs.refundableSig, 'hex'), Buffer.from(lenderSigs.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs.seizableSig, 'hex'), Buffer.from(lenderSigs.seizableSig, 'hex')]
        }

        const multisigSendTxHash = await bitcoin.client.loan.collateral.multisigSend(lockTxHash, sigs, colParams.pubKeys, colParams.secretHashes, colParams.expirations, outputs)

        await bitcoin.client.chain.generateBlock(1)

        await this.sales.provideSecret(this.sale, lendSecs[1]) // SECRET B2 IS NOW GLOBAL
        await this.sales.provideSecret(this.sale, borSecs[1])  // SECRET A2 IS NOW GLOBAL

        await increaseTime(toSecs({ hours: 4, minutes: 1 }))
        await this.sales.refund(this.sale, { from: liquidator })

        await approveAndTransfer(this.token, liquidator2, this.loans, toWei('100', unit))
        this.sale2 = await liquidate(this.loans, this.loan, liquidatorSechs[1], hash160(liquidatorBTC2.pubKey), liquidator2) // SECRETHASH D2 IS SET
        
        const swapSecretHashes2 = await getSwapSecretHashes(this.sales, this.sale2)

        const swapExpiration2 = parseInt(remove0x(await this.sales.swapExpiration(this.sale2)).toString())
        const swapExpirations2 = { approveExpiration, liquidationExpiration, seizureExpiration, swapExpiration: swapExpiration2 }

        const swapParams2 = [colParams.pubKeys, swapSecretHashes2, swapExpirations2]
        const lockAddresses2 = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams2)

        const outputs2 = [{ address: lockAddresses2.refundableAddress }, { address: lockAddresses2.seizableAddress }]

        const multisigBorrowerParams2 = [multisigSendTxHash, colParams.pubKeys, swapSecretHashes, swapExpirations, 'borrower', outputs2]
        const borrowerSigs2 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigBorrowerParams2)

        const multisigParamsLender2 = [multisigSendTxHash, colParams.pubKeys, swapSecretHashes, swapExpirations, 'lender', outputs2]
        const lenderSigs2 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigParamsLender2)

        const sigs2 = {
          refundable: [Buffer.from(borrowerSigs2.refundableSig, 'hex'), Buffer.from(lenderSigs2.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs2.seizableSig, 'hex'), Buffer.from(lenderSigs2.seizableSig, 'hex')]
        }

        const multisigMoveTxHash = await bitcoin.client.loan.collateralSwap.multisigMove(multisigSendTxHash, sigs2, colParams.pubKeys, swapSecretHashes, swapExpirations, outputs2)

        await bitcoin.client.chain.generateBlock(1)

        await increaseTime(toSecs({ hours: 4, minutes: 1 }))
        await this.sales.refund(this.sale2, { from: liquidator2 })

        await approveAndTransfer(this.token, liquidator3, this.loans, toWei('100', unit))
        this.sale3 = await liquidate(this.loans, this.loan, liquidatorSechs[2], hash160(liquidatorBTC3.pubKey), liquidator3) // SECRETHASH D3 IS SET

        const swapSecretHashes3 = await getSwapSecretHashes(this.sales, this.sale3)

        const swapExpiration3 = parseInt(remove0x(await this.sales.swapExpiration(this.sale3)).toString())
        const swapExpirations3 = { approveExpiration, liquidationExpiration, seizureExpiration, swapExpiration: swapExpiration3 }

        const swapParams3 = [colParams.pubKeys, swapSecretHashes3, swapExpirations3]
        const lockAddresses3 = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams3)

        const outputs3 = [{ address: lockAddresses3.refundableAddress }, { address: lockAddresses3.seizableAddress }]

        const multisigBorrowerParams3 = [multisigMoveTxHash, colParams.pubKeys, swapSecretHashes2, swapExpirations2, 'borrower', outputs3]
        const borrowerSigs3 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigBorrowerParams3)

        const multisigParamsLender3 = [multisigMoveTxHash, colParams.pubKeys, swapSecretHashes2, swapExpirations2, 'lender', outputs3]
        const lenderSigs3 = await bitcoin.client.loan.collateralSwap.multisigWrite(...multisigParamsLender3)

        const sigs3 = {
          refundable: [Buffer.from(borrowerSigs3.refundableSig, 'hex'), Buffer.from(lenderSigs3.refundableSig, 'hex')],
          seizable: [Buffer.from(borrowerSigs3.seizableSig, 'hex'), Buffer.from(lenderSigs3.seizableSig, 'hex')]
        }

        const multisigMoveTxHash2 = await bitcoin.client.loan.collateralSwap.multisigMove(multisigMoveTxHash, sigs3, colParams.pubKeys, swapSecretHashes2, swapExpirations2, outputs3)

        const currentTime = await getCurrentTime()

        await increaseTime(seizureExpiration - currentTime + 1000)

        const seizeParams = [multisigMoveTxHash2, colParams.pubKeys, swapSecretHashes3, swapExpirations3]
        const seizeTxHash = await bitcoin.client.loan.collateralSwap.snatch(...seizeParams)    })
    })
  })
})
