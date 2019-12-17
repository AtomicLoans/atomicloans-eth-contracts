const bitcoinjs = require('@mblackmblack/bitcoinjs-lib')
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
const P2SH = artifacts.require('./P2SH.sol');
const ISPVRequestManager = artifacts.require('./ISPVRequestManager.sol')
const Med = artifacts.require('./MedianizerExample.sol');

const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');
const Comptroller = artifacts.require('./Comptroller.sol')

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei, hexToNumberString } = web3.utils;

const BTC_TO_SAT = 10**8

// const stablecoins = [ { name: 'SAI', unit: 'ether' }, { name: 'USDC', unit: 'mwei' } ]
const stablecoins = [ { name: 'SAI', unit: 'ether' } ]

async function getContracts(stablecoin) {
  if (stablecoin == 'SAI') {
    const funds = await Funds.deployed();
    const loans = await Loans.deployed();
    const sales = await Sales.deployed();
    const token = await ExampleCoin.deployed();
    const med   = await Med.deployed();
    const p2sh  = await P2SH.deployed();
    const onDemandSpv = await ISPVRequestManager.deployed()

    return { funds, loans, sales, token, med, p2sh, onDemandSpv }
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

    const p2sh = await P2SH.new(loans.address)
    const onDemandSpv = await ISPVRequestManager.deployed()

    await loans.setP2SH(p2sh.address)
    await loans.setOnDemandSpv(onDemandSpv.address)

    return { funds, loans, sales, token, med, p2sh, onDemandSpv }
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

async function lockApproveWithdraw(contract, instance, btcPrice, unit, col, borrowerAddress, borrowerSecret) {
  const { owedToLender, owedForLoan, collateral } = await getLoanValues(contract, instance)
  const collateralSatValues = [collateral, owedToLender, btcPrice, unit]

  const values = getCollateralSatAmounts(collateral, owedToLender, btcPrice, unit);
  assert.equal((values.refundableValue + values.seizableValue), col)

  const colParams = await getCollateralParams(collateralSatValues, contract, instance)
  const lockParams = [colParams.values, colParams.pubKeys, colParams.secretHashes, colParams.expirations]

  const lockTxHash = await bitcoin.client.loan.collateral.lock(...lockParams)

  await bitcoin.client.chain.generateBlock(1)

  await contract.approve(instance)

  await contract.withdraw(instance, borrowerSecret, { from: borrowerAddress }) // SECRET A1 IS NOW GLOBAL

  return { colParams, owedForLoan, lockTxHash }
}

async function approveRepayAccept(contract, tokenContract, instance, borrowerAddress, borrowerBTC, lenderSecret, unit, owedForLoan) {
  // Send funds to borrower so they can repay full
  await tokenContract.transfer(borrowerAddress, toWei('1', unit))

  await increaseTime(toSecs({ days: 1, hours: 18 }))

  await tokenContract.approve(contract.address, toWei('300', unit), { from: borrowerAddress })

  await contract.repay(instance, owedForLoan, { from: borrowerAddress })

  await contract.accept(instance, lenderSecret) // SECRET B1 IS NOW GLOBAL
}

async function getLoanSpvRequests(loansContract, onDemandSpvContract, instance) {
  const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await loansContract.loanRequests.call(instance)

  const refundOneConfRequest = await onDemandSpvContract.getRequest.call(refundRequestIDOneConf)
  const refundSixConfRequest = await onDemandSpvContract.getRequest.call(refundRequestIDSixConf)
  const seizeOneConfRequest = await onDemandSpvContract.getRequest.call(seizeRequestIDOneConf)
  const seizeSixConfRequest = await onDemandSpvContract.getRequest.call(seizeRequestIDSixConf)

  expect(refundOneConfRequest.consumer).to.equal(loansContract.address)
  expect(refundSixConfRequest.consumer).to.equal(loansContract.address)
  expect(seizeOneConfRequest.consumer).to.equal(loansContract.address)
  expect(seizeSixConfRequest.consumer).to.equal(loansContract.address)

  return { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf }
}

async function unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col) {
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
}

async function collateralUnlockChecks(borBTCBalanceBefore, borBTCBalanceAfter, col, refundTxHash, acceptSecret) {
  assert.isAbove(parseInt(BigNumber(borBTCBalanceAfter).toFixed(0)), parseInt(BigNumber(borBTCBalanceBefore).plus(col).times(0.9).toFixed(0)))

  const refundTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(refundTxHash)
  const refundTx = await bitcoin.client.getMethod('decodeRawTransaction')(refundTxRaw)

  const refundVouts = refundTx._raw.data.vout
  const refundVins = refundTx._raw.data.vin

  expect(refundVins.length).to.equal(2)
  expect(refundVouts.length).to.equal(1)

  expect(getVinRedeemScript(refundVins[0]).includes(remove0x(acceptSecret))).to.equal(true)
  expect(getVinRedeemScript(refundVins[1]).includes(remove0x(acceptSecret))).to.equal(true)
}

stablecoins.forEach((stablecoin) => {
  const { name, unit } = stablecoin

  contract(`${name} Spv`, accounts => {
    const lender = accounts[0]
    const borrower = accounts[1]
    const arbiter = accounts[2]
    const liquidator = accounts[3]
    const liquidator2 = accounts[4]
    const liquidator3 = accounts[5]

    let lenderBTC, borrowerBTC, arbiterBTC

    let currentTime
    let btcPrice

    const loanReq = 100; // 100 SAI
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

      lenderBTC = await getUnusedPubKeyAndAddress()
      borrowerBTC = await getUnusedPubKeyAndAddress()
      arbiterBTC = await getUnusedPubKeyAndAddress()
      liquidatorBTC = await getUnusedPubKeyAndAddress()
      liquidatorBTC2 = await getUnusedPubKeyAndAddress()
      liquidatorBTC3 = await getUnusedPubKeyAndAddress()

      liquidatorBTC.pubKeyhash = hash160(liquidatorBTC.pubKey)
      liquidatorBTC2.pubKeyHash = hash160(liquidatorBTC2.pubKey)
      liquidatorBTC3.pubKeyHash = hash160(liquidatorBTC3.pubKey)

      btcPrice = '7367.49'

      col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      const { funds, loans, sales, token, med, p2sh, onDemandSpv } = await getContracts(name)

      this.funds = funds
      this.loans = loans
      this.sales = sales
      this.token = token
      this.med = med
      this.p2sh = p2sh
      this.onDemandSpv = onDemandSpv

      await this.med.poke(numToBytes32(toWei(btcPrice, 'ether')))

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

    describe('Add seizable collateral', function () {
      it('should update collateral value after 1 confirmation', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueAfterOneAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
        expect(BigNumber(col).plus(addSeizableValue).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed()) // Ensure collateral balance equals added collateral

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)
        
        const refundSeizableParams = [lockSeizableTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundSeizableTxHash = await bitcoin.client.loan.collateral.refundSeizable(...refundSeizableParams)
      })
    })

    describe('Add refundable collateral', function() {
      it('should update collateral value after 1 confirmation if min seizable collateral value is satisfied', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 1.2).toString(), 'ether')))

        const addRefundableValue = Math.ceil(colParams.values.refundableValue / 2)

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockRefundableTxHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
        const lockRefundableTxHashForProof = ensure0x(Buffer.from(lockRefundableTxHash, 'hex').reverse().toString('hex'))

        const lockRefundableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockRefundableTxHash)
        const lockRefundableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockRefundableTxRaw)
        const lockRefundableP2WSHVout = lockRefundableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockRefundableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockRefundableTxRaw)
        const lockRefundableVin = ensure0x(lockRefundableBitcoinJsTx.getVin())
        const lockRefundableVout = ensure0x(lockRefundableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockRefundableP2WSHVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingCollateral).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
        assert.isAbove(parseInt(BigNumber(collateralValueAfterSixAddingCollateral).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
        expect(BigNumber(collateralValueAfterOneAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
        expect(BigNumber(col).plus(addRefundableValue).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed()) // Ensure collateral balance equals added collateral

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundRefundableParams = [lockRefundableTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundRefundableTxHash = await bitcoin.client.loan.collateral.refundRefundable(...refundRefundableParams)
      })

      it('should not update collateral value after 1 confirmation if min seizable collateral value is not satisfied', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.8).toString(), 'ether')))

        const addRefundableValue = Math.ceil(colParams.values.refundableValue / 2)

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockRefundableTxHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
        const lockRefundableTxHashForProof = ensure0x(Buffer.from(lockRefundableTxHash, 'hex').reverse().toString('hex'))

        const lockRefundableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockRefundableTxHash)
        const lockRefundableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockRefundableTxRaw)
        const lockRefundableP2WSHVout = lockRefundableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockRefundableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockRefundableTxRaw)
        const lockRefundableVin = ensure0x(lockRefundableBitcoinJsTx.getVin())
        const lockRefundableVout = ensure0x(lockRefundableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockRefundableP2WSHVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed()) // Ensure collateral balance equals added collateral

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundRefundableParams = [lockRefundableTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundRefundableTxHash = await bitcoin.client.loan.collateral.refundRefundable(...refundRefundableParams)
      })
    })

    describe('Add refundable collateral first then seizable collateral', function() {
      it('should not update collateral value until seizable collateral has been confirmed when min seizable collateral isn\'t satisfied after 1 confirmation', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.8).toString(), 'ether')))

        const lockMoreCollateralParams = [colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockMoreCollateralTxHash = await bitcoin.client.loan.collateral.lock(colParams.values, ...lockMoreCollateralParams)
        const lockMoreCollateralAddresses = await bitcoin.client.loan.collateral.getLockAddresses(...lockMoreCollateralParams)
        const { refundableAddress, seizableAddress } = lockMoreCollateralAddresses
        const lockMoreCollateralTxHashForProof = ensure0x(Buffer.from(lockMoreCollateralTxHash, 'hex').reverse().toString('hex'))

        const lockMoreCollateralTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockMoreCollateralTxHash)
        const lockMoreCollateralTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockMoreCollateralTxRaw)

        const lockMoreCollateralRefundableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === refundableAddress)
        const lockMoreCollateralSeizableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === seizableAddress)

        const lockMoreCollateralBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockMoreCollateralTxRaw)
        const lockMoreCollateralVin = ensure0x(lockMoreCollateralBitcoinJsTx.getVin())
        const lockMoreCollateralVout = ensure0x(lockMoreCollateralBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const refundableInputIndex = 0
        const refundableOutputIndex = lockMoreCollateralRefundableVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        const seizableInputIndex = 0
        const seizableOutputIndex = lockMoreCollateralSeizableVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingSeizableCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingSeizableCollateral = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingRefundableCollateral).toFixed())
        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingSeizableCollateral).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral).toFixed())

        const { refundableValue, seizableValue } = colParams.values

        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingRefundableCollateral).toFixed())
        expect(BigNumber(col).plus(seizableValue).plus(refundableValue).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed())
        expect(BigNumber(col).plus(seizableValue).plus(refundableValue).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundMoreCollateralParams = [lockMoreCollateralTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundMoreCollateralTxHash = await bitcoin.client.loan.collateral.refund(...refundMoreCollateralParams)
      })

      it('should not update collateral value until seizable collateral has been confirmed when min seizable collateral isn\'t satisfied after 6 confirmations', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.8).toString(), 'ether'))) // Ensure minSeizableCollateral not satisfied

        const lockMoreCollateralParams = [colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockMoreCollateralTxHash = await bitcoin.client.loan.collateral.lock(colParams.values, ...lockMoreCollateralParams)
        const lockMoreCollateralAddresses = await bitcoin.client.loan.collateral.getLockAddresses(...lockMoreCollateralParams)
        const { refundableAddress, seizableAddress } = lockMoreCollateralAddresses
        const lockMoreCollateralTxHashForProof = ensure0x(Buffer.from(lockMoreCollateralTxHash, 'hex').reverse().toString('hex'))

        const lockMoreCollateralTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockMoreCollateralTxHash)
        const lockMoreCollateralTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockMoreCollateralTxRaw)

        const lockMoreCollateralRefundableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === refundableAddress)
        const lockMoreCollateralSeizableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === seizableAddress)

        const lockMoreCollateralBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockMoreCollateralTxRaw)
        const lockMoreCollateralVin = ensure0x(lockMoreCollateralBitcoinJsTx.getVin())
        const lockMoreCollateralVout = ensure0x(lockMoreCollateralBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const refundableInputIndex = 0
        const refundableOutputIndex = lockMoreCollateralRefundableVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        const seizableInputIndex = 0
        const seizableOutputIndex = lockMoreCollateralSeizableVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingSeizableCollateral = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingSeizableCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingRefundableCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral).toFixed())
        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
        expect(BigNumber(collateralValueAfterSixAddingSeizableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed())

        const { refundableValue, seizableValue } = colParams.values

        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral).toFixed())
        expect(BigNumber(col).plus(refundableValue).plus(seizableValue).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed())
        expect(BigNumber(col).plus(refundableValue).plus(seizableValue).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingSeizableCollateral).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundMoreCollateralParams = [lockMoreCollateralTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundMoreCollateralTxHash = await bitcoin.client.loan.collateral.refund(...refundMoreCollateralParams)
      })
    })

    describe('Add seizable collateral first then refundable collateral', function() {
      it('should update collateral value as soon as seizable collateral is confirmed, and then increase it again once refundable collateral is added', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.8).toString(), 'ether'))) // Ensure minSeizableCollateral not satisfied

        const lockMoreCollateralParams = [colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockMoreCollateralTxHash = await bitcoin.client.loan.collateral.lock(colParams.values, ...lockMoreCollateralParams)
        const lockMoreCollateralAddresses = await bitcoin.client.loan.collateral.getLockAddresses(...lockMoreCollateralParams)
        const { refundableAddress, seizableAddress } = lockMoreCollateralAddresses
        const lockMoreCollateralTxHashForProof = ensure0x(Buffer.from(lockMoreCollateralTxHash, 'hex').reverse().toString('hex'))

        const lockMoreCollateralTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockMoreCollateralTxHash)
        const lockMoreCollateralTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockMoreCollateralTxRaw)

        const lockMoreCollateralRefundableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === refundableAddress)
        const lockMoreCollateralSeizableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === seizableAddress)

        const lockMoreCollateralBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockMoreCollateralTxRaw)
        const lockMoreCollateralVin = ensure0x(lockMoreCollateralBitcoinJsTx.getVin())
        const lockMoreCollateralVout = ensure0x(lockMoreCollateralBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const seizableInputIndex = 0
        const seizableOutputIndex = lockMoreCollateralSeizableVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingSeizableCollateral = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingSeizableCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        const refundableInputIndex = 0
        const refundableOutputIndex = lockMoreCollateralRefundableVout.n

        // SPV FILL REQUEST REFUND COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST REFUND COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingSeizableCollateral).toFixed())

        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingRefundableCollateral).toFixed()), parseInt(BigNumber(collateralValueAfterSixAddingSeizableCollateral).toFixed()))
        expect(BigNumber(collateralValueAfterOneAddingRefundableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundMoreCollateralParams = [lockMoreCollateralTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundMoreCollateralTxHash = await bitcoin.client.loan.collateral.refund(...refundMoreCollateralParams)
      })
    })

    describe('Add seizable and refundable collateral multiple times with request confirmations out of order', function() {
      it('should not add collateral value if minSeizableCollateral is not satisfied', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 1.2).toString(), 'ether'))) // Ensure minSeizableCollateral not satisfied

        const lockMoreCollateralParams = [colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockMoreCollateralAddresses = await bitcoin.client.loan.collateral.getLockAddresses(...lockMoreCollateralParams)
        const { refundableAddress, seizableAddress } = lockMoreCollateralAddresses

        // Lock More Collateral 1
        const lockMoreCollateral_1_TxHash = await bitcoin.client.loan.collateral.lock(colParams.values, ...lockMoreCollateralParams)
        const lockMoreCollateral_1_TxHashForProof = ensure0x(Buffer.from(lockMoreCollateral_1_TxHash, 'hex').reverse().toString('hex'))

        const lockMoreCollateral_1_TxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockMoreCollateral_1_TxHash)
        const lockMoreCollateral_1_Tx = await bitcoin.client.getMethod('decodeRawTransaction')(lockMoreCollateral_1_TxRaw)

        const lockMoreCollateral_1_RefundableVout = lockMoreCollateral_1_Tx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === refundableAddress)
        const lockMoreCollateral_1_SeizableVout = lockMoreCollateral_1_Tx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === seizableAddress)

        const lockMoreCollateral_1_BitcoinJsTx = bitcoinjs.Transaction.fromHex(lockMoreCollateral_1_TxRaw)
        const lockMoreCollateral_1_Vin = ensure0x(lockMoreCollateral_1_BitcoinJsTx.getVin())
        const lockMoreCollateral_1_Vout = ensure0x(lockMoreCollateral_1_BitcoinJsTx.getVout())

        // Lock More Collateral 2
        const lockMoreCollateral_2_TxHash = await bitcoin.client.loan.collateral.lock(colParams.values, ...lockMoreCollateralParams)
        const lockMoreCollateral_2_TxHashForProof = ensure0x(Buffer.from(lockMoreCollateral_2_TxHash, 'hex').reverse().toString('hex'))

        const lockMoreCollateral_2_TxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockMoreCollateral_2_TxHash)
        const lockMoreCollateral_2_Tx = await bitcoin.client.getMethod('decodeRawTransaction')(lockMoreCollateral_2_TxRaw)

        const lockMoreCollateral_2_RefundableVout = lockMoreCollateral_2_Tx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === refundableAddress)
        const lockMoreCollateral_2_SeizableVout = lockMoreCollateral_2_Tx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === seizableAddress)

        const lockMoreCollateral_2_BitcoinJsTx = bitcoinjs.Transaction.fromHex(lockMoreCollateral_2_TxRaw)
        const lockMoreCollateral_2_Vin = ensure0x(lockMoreCollateral_2_BitcoinJsTx.getVin())
        const lockMoreCollateral_2_Vout = ensure0x(lockMoreCollateral_2_BitcoinJsTx.getVout())

        // Lock More Collateral 3
        const lockMoreCollateral_3_TxHash = await bitcoin.client.loan.collateral.lock(colParams.values, ...lockMoreCollateralParams)
        const lockMoreCollateral_3_TxHashForProof = ensure0x(Buffer.from(lockMoreCollateral_3_TxHash, 'hex').reverse().toString('hex'))

        const lockMoreCollateral_3_TxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockMoreCollateral_3_TxHash)
        const lockMoreCollateral_3_Tx = await bitcoin.client.getMethod('decodeRawTransaction')(lockMoreCollateral_3_TxRaw)

        const lockMoreCollateral_3_RefundableVout = lockMoreCollateral_3_Tx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === refundableAddress)
        const lockMoreCollateral_3_SeizableVout = lockMoreCollateral_3_Tx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === seizableAddress)

        const lockMoreCollateral_3_BitcoinJsTx = bitcoinjs.Transaction.fromHex(lockMoreCollateral_3_TxRaw)
        const lockMoreCollateral_3_Vin = ensure0x(lockMoreCollateral_3_BitcoinJsTx.getVin())
        const lockMoreCollateral_3_Vout = ensure0x(lockMoreCollateral_3_BitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const refundableInputIndex_1 = 0
        const refundableOutputIndex_1 = lockMoreCollateral_1_RefundableVout.n

        const refundableInputIndex_2 = 0
        const refundableOutputIndex_2 = lockMoreCollateral_2_RefundableVout.n

        const refundableInputIndex_3 = 0
        const refundableOutputIndex_3 = lockMoreCollateral_3_RefundableVout.n

        const seizableInputIndex_1 = 0
        const seizableOutputIndex_1 = lockMoreCollateral_1_SeizableVout.n

        const seizableInputIndex_2 = 0
        const seizableOutputIndex_2 = lockMoreCollateral_2_SeizableVout.n

        const seizableInputIndex_3 = 0
        const seizableOutputIndex_3 = lockMoreCollateral_3_SeizableVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL #1 ONE CONFIRMATION
        const fillRefundRequest_1_OneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, refundRequestIDOneConf, refundableInputIndex_1, refundableOutputIndex_1)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, refundRequestIDOneConf, refundableInputIndex_1, refundableOutputIndex_1)
        expect(fillRefundRequest_1_OneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral_1 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL #2 ONE CONFIRMATION
        const fillRefundRequest_2_OneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, refundRequestIDOneConf, refundableInputIndex_2, refundableOutputIndex_2)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, refundRequestIDOneConf, refundableInputIndex_2, refundableOutputIndex_2)
        expect(fillRefundRequest_2_OneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral_2 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL #3 ONE CONFIRMATION
        const fillRefundRequest_3_OneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, refundRequestIDOneConf, refundableInputIndex_3, refundableOutputIndex_3)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, refundRequestIDOneConf, refundableInputIndex_3, refundableOutputIndex_3)
        expect(fillRefundRequest_3_OneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral_3 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST SEIZABLE COLLATERAL #1 ONE CONFIRMATION
        const fillSeizeRequest_1_OneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, seizeRequestIDOneConf, seizableInputIndex_1, seizableOutputIndex_1)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, seizeRequestIDOneConf, seizableInputIndex_1, seizableOutputIndex_1)
        expect(fillSeizeRequest_1_OneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingSeizableCollateral_1 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST SEIZABLE COLLATERAL #2 ONE CONFIRMATION
        const fillSeizeRequest_2_OneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, seizeRequestIDOneConf, seizableInputIndex_2, seizableOutputIndex_2)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, seizeRequestIDOneConf, seizableInputIndex_2, seizableOutputIndex_2)
        expect(fillSeizeRequest_2_OneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingSeizableCollateral_2 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST SEIZABLE COLLATERAL #3 ONE CONFIRMATION
        const fillSeizeRequest_3_OneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, seizeRequestIDOneConf, seizableInputIndex_3, seizableOutputIndex_3)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, seizeRequestIDOneConf, seizableInputIndex_3, seizableOutputIndex_3)
        expect(fillSeizeRequest_3_OneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingSeizableCollateral_3 = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL #3 SIX CONFIRMATION
        const fillSeizeRequest_3_SixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, seizeRequestIDSixConf, seizableInputIndex_3, seizableOutputIndex_3)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, seizeRequestIDSixConf, seizableInputIndex_3, seizableOutputIndex_3)
        expect(fillSeizeRequest_3_SixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingSeizableCollateral_3 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST SEIZABLE COLLATERAL #2 SIX CONFIRMATION
        const fillSeizeRequest_2_SixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, seizeRequestIDSixConf, seizableInputIndex_2, seizableOutputIndex_2)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, seizeRequestIDSixConf, seizableInputIndex_2, seizableOutputIndex_2)
        expect(fillSeizeRequest_2_SixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingSeizableCollateral_2 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST SEIZABLE COLLATERAL #1 SIX CONFIRMATION
        const fillSeizeRequest_1_SixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, seizeRequestIDSixConf, seizableInputIndex_1, seizableOutputIndex_1)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, seizeRequestIDSixConf, seizableInputIndex_1, seizableOutputIndex_1)
        expect(fillSeizeRequest_1_SixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingSeizableCollateral_1 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL #3 SIX CONFIRMATION
        const fillRefundRequest_3_SixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, refundRequestIDSixConf, refundableInputIndex_3, refundableOutputIndex_3)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_3_TxHashForProof, lockMoreCollateral_3_Vin, lockMoreCollateral_3_Vout, refundRequestIDSixConf, refundableInputIndex_3, refundableOutputIndex_3)
        expect(fillRefundRequest_3_SixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral_3 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL #2 SIX CONFIRMATION
        const fillRefundRequest_2_SixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, refundRequestIDSixConf, refundableInputIndex_2, refundableOutputIndex_2)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_2_TxHashForProof, lockMoreCollateral_2_Vin, lockMoreCollateral_2_Vout, refundRequestIDSixConf, refundableInputIndex_2, refundableOutputIndex_2)
        expect(fillRefundRequest_2_SixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral_2 = await this.loans.collateral.call(this.loan)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL #1 SIX CONFIRMATION
        const fillRefundRequest_1_SixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, refundRequestIDSixConf, refundableInputIndex_1, refundableOutputIndex_1)
        await this.onDemandSpv.fillRequest(lockMoreCollateral_1_TxHashForProof, lockMoreCollateral_1_Vin, lockMoreCollateral_1_Vout, refundRequestIDSixConf, refundableInputIndex_1, refundableOutputIndex_1)
        expect(fillRefundRequest_1_SixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral_1 = await this.loans.collateral.call(this.loan)

        await increaseTime(toSecs({ hours: 5 }))

        const collateralValueAfterTimeout = await this.loans.collateral.call(this.loan)

        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingRefundableCollateral_1).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingRefundableCollateral_2).toFixed()), parseInt(BigNumber(collateralValueAfterOneAddingRefundableCollateral_1).toFixed()))
        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingRefundableCollateral_3).toFixed()), parseInt(BigNumber(collateralValueAfterOneAddingRefundableCollateral_2).toFixed()))
        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral_1).toFixed()), parseInt(BigNumber(collateralValueAfterOneAddingRefundableCollateral_3).toFixed()))
        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral_2).toFixed()), parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral_1).toFixed()))
        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()), parseInt(BigNumber(collateralValueAfterOneAddingSeizableCollateral_2).toFixed()))

        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingSeizableCollateral_3).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingSeizableCollateral_2).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingSeizableCollateral_1).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral_3).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral_2).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral_1).toFixed())
        expect(BigNumber(collateralValueAfterOneAddingSeizableCollateral_3).toFixed()).to.equal(BigNumber(collateralValueAfterTimeout).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)
      })
    })

    describe('Locking collateral multiple times', function() {
      it('should allow adding of temporary refundable collateral 200 times without running out of gas', async function() {
        this.timeout(9900000);

        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.8).toString(), 'ether')))

        const addRefundableValue = Math.ceil(colParams.values.refundableValue / 2)
        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]

        const lockRefundableTxs = []

        const timesToLockRefundable = 100

        for (let i = 0; i < timesToLockRefundable; i++) {
          const txHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
          const txHashForProof = ensure0x(Buffer.from(txHash, 'hex').reverse().toString('hex'))

          const txRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(txHash)
          const tx = await bitcoin.client.getMethod('decodeRawTransaction')(txRaw)
          const refundableVout = tx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

          const bitcoinJsTx = bitcoinjs.Transaction.fromHex(txRaw)
          const vin = ensure0x(bitcoinJsTx.getVin())
          const vout = ensure0x(bitcoinJsTx.getVout())

          const inputIndex = 0
          const outputIndex = refundableVout.n

          lockRefundableTxs.push({ txHash, txHashForProof, txRaw, tx, refundableVout, bitcoinJsTx, vin, vout, inputIndex, outputIndex })
        }

        await bitcoin.client.chain.generateBlock(1)

        for (let i = 0; i < timesToLockRefundable; i++) {
          const lockRefundableTx = lockRefundableTxs[i]
          const { txHashForProof, vin, vout, inputIndex, outputIndex } = lockRefundableTx

          // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
          const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(txHashForProof, vin, vout, refundRequestIDOneConf, inputIndex, outputIndex)
          await this.onDemandSpv.fillRequest(txHashForProof, vin, vout, refundRequestIDOneConf, inputIndex, outputIndex)
          expect(fillRefundRequestOneConfSuccess).to.equal(true)

          lockRefundableTxs[i].fillRefundRequestOneConfSuccess = fillRefundRequestOneConfSuccess
        }

        await bitcoin.client.chain.generateBlock(5)

        for (let i = 0; i < timesToLockRefundable; i++) {
          const lockRefundableTx = lockRefundableTxs[i]
          const { txHashForProof, vin, vout, inputIndex, outputIndex } = lockRefundableTx

          // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATION
          const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(txHashForProof, vin, vout, refundRequestIDSixConf, inputIndex, outputIndex)
          await this.onDemandSpv.fillRequest(txHashForProof, vin, vout, refundRequestIDSixConf, inputIndex, outputIndex)
          expect(fillRefundRequestSixConfSuccess).to.equal(true)

          lockRefundableTxs[i].fillRefundRequestSixConfSuccess = fillRefundRequestSixConfSuccess
        }

        const collateralValueAfterSixAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        assert.isAbove(parseInt(BigNumber(collateralValueAfterOneAddingCollateral).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
        assert.isAbove(parseInt(BigNumber(collateralValueAfterSixAddingCollateral).toFixed()), parseInt(BigNumber(collateralValueBeforeAddingCollateral).toFixed()))
      })
    })

    describe('Adding collateral that is below 1% of ', function() {
      it('should fail adding seizable collateral', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        const addSeizableValue = Math.ceil((colParams.values.seizableValue + colParams.values.refundableValue) / 110) // Less than 1% of collateral value

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundSeizableParams = [lockSeizableTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundSeizableTxHash = await bitcoin.client.loan.collateral.refundSeizable(...refundSeizableParams)
      })

      it('should fail adding refundable collateral', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 1.2).toString(), 'ether')))

        const addRefundableValue = Math.ceil((colParams.values.seizableValue + colParams.values.refundableValue) / 110) // Less than 1% of collateral value

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockRefundableTxHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
        const lockRefundableTxHashForProof = ensure0x(Buffer.from(lockRefundableTxHash, 'hex').reverse().toString('hex'))

        const lockRefundableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockRefundableTxHash)
        const lockRefundableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockRefundableTxRaw)
        const lockRefundableP2WSHVout = lockRefundableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockRefundableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockRefundableTxRaw)
        const lockRefundableVin = ensure0x(lockRefundableBitcoinJsTx.getVin())
        const lockRefundableVout = ensure0x(lockRefundableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockRefundableP2WSHVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundRefundableParams = [lockRefundableTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundRefundableTxHash = await bitcoin.client.loan.collateral.refundRefundable(...refundRefundableParams)
      })

      it('should fail adding refundable collateral that is slightly above 1%, after seizable collateral has been added with 6 confirmations', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const seizableInputIndex = 0
        const seizableOutputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueAfterOneAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
        expect(BigNumber(col).plus(addSeizableValue).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed()) // Ensure collateral balance equals added collateral

        const collateralValueBeforeAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        const addRefundableValue = Math.ceil((colParams.values.seizableValue + colParams.values.refundableValue) / 90) // Less than 1% of collateral value

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockRefundableTxHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
        const lockRefundableTxHashForProof = ensure0x(Buffer.from(lockRefundableTxHash, 'hex').reverse().toString('hex'))

        const lockRefundableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockRefundableTxHash)
        const lockRefundableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockRefundableTxRaw)
        const lockRefundableP2WSHVout = lockRefundableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockRefundableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockRefundableTxRaw)
        const lockRefundableVin = ensure0x(lockRefundableBitcoinJsTx.getVin())
        const lockRefundableVout = ensure0x(lockRefundableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const refundableInputIndex = 0
        const refundableOutputIndex = lockRefundableP2WSHVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingRefundableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingRefundableCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingRefundableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundSeizableParams = [lockSeizableTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundSeizableTxHash = await bitcoin.client.loan.collateral.refundSeizable(...refundSeizableParams)
      })

      it('should fail adding refundable collateral that is slightly above 1%, after seizable collateral has been added with only 1 confirmation', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const seizableInputIndex = 0
        const seizableOutputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        const collateralValueBeforeAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        const addRefundableValue = Math.ceil((colParams.values.seizableValue + colParams.values.refundableValue) / 90) // Less than 1% of collateral value

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockRefundableTxHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
        const lockRefundableTxHashForProof = ensure0x(Buffer.from(lockRefundableTxHash, 'hex').reverse().toString('hex'))

        const lockRefundableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockRefundableTxHash)
        const lockRefundableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockRefundableTxRaw)
        const lockRefundableP2WSHVout = lockRefundableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockRefundableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockRefundableTxRaw)
        const lockRefundableVin = ensure0x(lockRefundableBitcoinJsTx.getVin())
        const lockRefundableVout = ensure0x(lockRefundableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const refundableInputIndex = 0
        const refundableOutputIndex = lockRefundableP2WSHVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingRefundableCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingRefundableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingRefundableCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingRefundableCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingRefundableCollateral).toFixed())

        await approveRepayAccept(this.loans, this.token, this.loan, borrower, borrowerBTC, lendSecs[0], unit, owedForLoan)
        const { acceptSecret } = await this.loans.secretHashes.call(this.loan)
        await unlockCollateral(acceptSecret, borrowerBTC, lockTxHash, colParams, col)

        const refundSeizableParams = [lockSeizableTxHash, colParams.pubKeys, remove0x(acceptSecret), colParams.secretHashes, colParams.expirations]
        const refundSeizableTxHash = await bitcoin.client.loan.collateral.refundSeizable(...refundSeizableParams)
      })
    })

    describe('Incorrect vout from onDemandSpv service', function() {
      it('should fail adding collateral if vout does not correspond to correct p2wsh', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        await expectRevert(this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, refundRequestIDOneConf, inputIndex, outputIndex), 'VM Exception while processing transaction: revert') // Use refundRequestIDOneConf instead of seizeRequestIDOneConf

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        await expectRevert(this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, refundRequestIDSixConf, inputIndex, outputIndex), 'VM Exception while processing transaction: revert') // Use refundRequestIDOneConf instead of seizeRequestIDOneConf

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
      })
    })

    describe('Incorrect onDemandSpv service address', function() {
      it('should fail adding collateral if onDemandSpv service address is incorrect', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        await expectRevert(this.loans.spv(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex), 'VM Exception while processing transaction: revert') // Use refundRequestIDOneConf instead of seizeRequestIDOneConf

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        await expectRevert(this.loans.spv(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex), 'VM Exception while processing transaction: revert') // Use refundRequestIDOneConf instead of seizeRequestIDOneConf

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterOneAddingCollateral).toFixed())
        expect(BigNumber(collateralValueBeforeAddingCollateral).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValueAfterSixAddingCollateral).toFixed())
      })
    })

    describe('onDemandSpv service `paysValue`', function() {
      it('should be 1% of collateral value', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValue = Math.ceil(colParams.values.seizableValue + colParams.values.refundableValue)
        const refundRequestOneConfPaysValue = (await this.onDemandSpv.getRequest.call(refundRequestIDOneConf)).paysValue
        const refundRequestSixConfPaysValue = (await this.onDemandSpv.getRequest.call(refundRequestIDSixConf)).paysValue
        const seizeRequestOneConfPaysValue = (await this.onDemandSpv.getRequest.call(seizeRequestIDOneConf)).paysValue
        const seizeRequestSixConfPaysValue = (await this.onDemandSpv.getRequest.call(seizeRequestIDSixConf)).paysValue

        expect(Math.floor(collateralValue / 100)).to.equal(parseInt(BigNumber(refundRequestOneConfPaysValue).toFixed()))
        expect(Math.floor(collateralValue / 100)).to.equal(parseInt(BigNumber(refundRequestSixConfPaysValue).toFixed()))
        expect(Math.floor(collateralValue / 100)).to.equal(parseInt(BigNumber(seizeRequestOneConfPaysValue).toFixed()))
        expect(Math.floor(collateralValue / 100)).to.equal(parseInt(BigNumber(seizeRequestSixConfPaysValue).toFixed()))
      })
    })

    describe('Collateral Balance', function() {
      it('should return the refundable + seizable collateral when no collateral has been added', async function() {
        await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const collateralValue = await this.loans.collateral.call(this.loan)

        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValue).toFixed()) // Ensure collateral balance equals added collateral
      })

      it('should return the refundable + seizable when minSeizableCollateral is not satisfied', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.8).toString(), 'ether')))

        const addRefundableValue = Math.ceil(colParams.values.refundableValue / 2)

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockRefundableTxHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
        const lockRefundableTxHashForProof = ensure0x(Buffer.from(lockRefundableTxHash, 'hex').reverse().toString('hex'))

        const lockRefundableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockRefundableTxHash)
        const lockRefundableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockRefundableTxRaw)
        const lockRefundableP2WSHVout = lockRefundableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockRefundableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockRefundableTxRaw)
        const lockRefundableVin = ensure0x(lockRefundableBitcoinJsTx.getVin())
        const lockRefundableVout = ensure0x(lockRefundableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockRefundableP2WSHVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValue = await this.loans.collateral.call(this.loan)

        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValue).toFixed()) // Ensure collateral balance equals added collateral
      })

      it('should return the refundable + seizable when temporaryCollateral expiration is past the 4 hour expiry date', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        // NOTE that sixth confirmation with spv does not occur

        await increaseTime(toSecs({ hours: 5 }))

        const collateralValue = await this.loans.collateral.call(this.loan)

        expect(BigNumber(col).toFixed()).to.equal(BigNumber(collateralValue).toFixed()) // Ensure collateral balance equals added collateral
      })

      it('should return the refundable + seizable + temporary refundable + temporary seizable when adding collateral in queue while satisfying both minSeizableCollateral and temporaryCollateral expiration', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 1.2).toString(), 'ether'))) // Ensure minSeizableCollateral not satisfied

        const { refundableValue, seizableValue } = colParams.values

        const lockMoreCollateralParams = [colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockMoreCollateralTxHash = await bitcoin.client.loan.collateral.lock(colParams.values, ...lockMoreCollateralParams)
        const lockMoreCollateralAddresses = await bitcoin.client.loan.collateral.getLockAddresses(...lockMoreCollateralParams)
        const { refundableAddress, seizableAddress } = lockMoreCollateralAddresses
        const lockMoreCollateralTxHashForProof = ensure0x(Buffer.from(lockMoreCollateralTxHash, 'hex').reverse().toString('hex'))

        const lockMoreCollateralTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockMoreCollateralTxHash)
        const lockMoreCollateralTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockMoreCollateralTxRaw)

        const lockMoreCollateralRefundableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === refundableAddress)
        const lockMoreCollateralSeizableVout = lockMoreCollateralTx._raw.data.vout.find(vout => vout.scriptPubKey.addresses[0] === seizableAddress)

        const lockMoreCollateralBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockMoreCollateralTxRaw)
        const lockMoreCollateralVin = ensure0x(lockMoreCollateralBitcoinJsTx.getVin())
        const lockMoreCollateralVout = ensure0x(lockMoreCollateralBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const seizableInputIndex = 0
        const seizableOutputIndex = lockMoreCollateralSeizableVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDOneConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, seizeRequestIDSixConf, seizableInputIndex, seizableOutputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        await bitcoin.client.chain.generateBlock(5)

        const refundableInputIndex = 0
        const refundableOutputIndex = lockMoreCollateralRefundableVout.n

        // SPV FILL REQUEST REFUND COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDOneConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        // SPV FILL REQUEST REFUND COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        await this.onDemandSpv.fillRequest(lockMoreCollateralTxHashForProof, lockMoreCollateralVin, lockMoreCollateralVout, refundRequestIDSixConf, refundableInputIndex, refundableOutputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValue = await this.loans.collateral.call(this.loan)

        expect(BigNumber(col).plus(refundableValue).plus(seizableValue).toFixed()).to.equal(BigNumber(collateralValue).toFixed()) // Ensure collateral balance equals added collateral
      })
    })

    describe('Liquidation', function() {
      it('should succeed if below minimum collateralization ratio and refundable collateral added does not satisfy the minSeizableCollateral', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.6).toString(), 'ether')))

        const addRefundableValue = Math.ceil(colParams.values.refundableValue / 2)

        const lockRefundableParams = [addRefundableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockRefundableTxHash = await bitcoin.client.loan.collateral.lockRefundable(...lockRefundableParams)
        const lockRefundableTxHashForProof = ensure0x(Buffer.from(lockRefundableTxHash, 'hex').reverse().toString('hex'))

        const lockRefundableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockRefundableTxHash)
        const lockRefundableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockRefundableTxRaw)
        const lockRefundableP2WSHVout = lockRefundableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockRefundableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockRefundableTxRaw)
        const lockRefundableVin = ensure0x(lockRefundableBitcoinJsTx.getVin())
        const lockRefundableVout = ensure0x(lockRefundableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockRefundableP2WSHVout.n

        // SPV FILL REQUEST REFUNDABLE COLLATERAL ONE CONFIRMATION
        const fillRefundRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDOneConf, inputIndex, outputIndex)
        expect(fillRefundRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST REFUNDABLE COLLATERAL SIX CONFIRMATIONS
        const fillRefundRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockRefundableTxHashForProof, lockRefundableVin, lockRefundableVout, refundRequestIDSixConf, inputIndex, outputIndex)
        expect(fillRefundRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('200', unit))

        await liquidate(this.loans, this.loan, liquidatorSechs[0], liquidatorpbkh, liquidator)

        const sale = (await this.loans.bools.call(this.loan)).sale

        expect(sale).to.equal(true)
      })

      it('should fail if now is less than added temporary collateral expiration, minimum collateralization ratio is satisfied as well as minSeizableCollateral', async function() {
        const { colParams, owedForLoan, lockTxHash } = await lockApproveWithdraw(this.loans, this.loan, btcPrice, unit, col, borrower, borSecs[0])

        const { refundRequestIDOneConf, refundRequestIDSixConf, seizeRequestIDOneConf, seizeRequestIDSixConf } = await getLoanSpvRequests(this.loans, this.onDemandSpv, this.loan) // Get loan spv requests associated with loan

        const collateralValueBeforeAddingCollateral = await this.loans.collateral.call(this.loan)

        await this.med.poke(numToBytes32(toWei((parseFloat(btcPrice) * 0.8).toString(), 'ether')))

        const addSeizableValue = Math.ceil(colParams.values.seizableValue / 2)

        const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockSeizableTxHash = await bitcoin.client.loan.collateral.lockSeizable(...lockSeizableParams)
        const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

        const lockSeizableTxRaw = await bitcoin.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
        const lockSeizableTx = await bitcoin.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
        const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

        const lockSeizableBitcoinJsTx = bitcoinjs.Transaction.fromHex(lockSeizableTxRaw)
        const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
        const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

        await bitcoin.client.chain.generateBlock(1)

        const inputIndex = 0
        const outputIndex = lockSeizableP2WSHVout.n

        // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
        const fillSeizeRequestOneConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex)
        expect(fillSeizeRequestOneConfSuccess).to.equal(true)

        const collateralValueAfterOneAddingCollateral = await this.loans.collateral.call(this.loan)

        await bitcoin.client.chain.generateBlock(5)

        // SPV FILL REQUEST SEIZABLE COLLATERAL SIX CONFIRMATIONS
        const fillSeizeRequestSixConfSuccess = await this.onDemandSpv.fillRequest.call(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        await this.onDemandSpv.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDSixConf, inputIndex, outputIndex)
        expect(fillSeizeRequestSixConfSuccess).to.equal(true)

        const collateralValueAfterSixAddingCollateral = await this.loans.collateral.call(this.loan)

        await approveAndTransfer(this.token, liquidator, this.loans, toWei('200', unit))

        await expectRevert(this.loans.liquidate(this.loan, liquidatorSechs[2], ensure0x(liquidatorpbkh), { from: liquidator }), 'VM Exception while processing transaction: revert')


        const minCollateralValue = await this.loans.minCollateralValue.call(this.loan)
        const collateralValue = await this.loans.collateralValue.call(this.loan)

        const seizableCollateral = await this.loans.seizableCollateral.call(this.loan)
        const temporarySeizableCollateral = await this.loans.temporarySeizableCollateral.call(this.loan)
        const minSeizableCollateralValue = await this.loans.minSeizableCollateralValue.call(this.loan)

        assert.isAbove(parseInt(BigNumber(collateralValue).toFixed()), parseInt(BigNumber(minCollateralValue).toFixed())) // Proving that the minimum collateralization ratio is above 140%
        assert.isAbove(parseInt(BigNumber(seizableCollateral).plus(temporarySeizableCollateral).toFixed()), parseInt(BigNumber(minSeizableCollateralValue).toFixed())) // Proving that the minSeizableValue is satisfied
      })
    })
  })
})
