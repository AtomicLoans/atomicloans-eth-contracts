const bitcoinjs = require('bitcoinjs-lib')
const { bitcoin } = require('./helpers/collateral/common.js')
const config = require('./helpers/collateral/config.js')

const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256, hash160 }    = require('@liquality/crypto')
const { ensure0x, remove0x }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
const axios         = require('axios');

const ExampleCoin = artifacts.require("./ExampleSaiCoin.sol");
const ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
const USDCInterestRateModel = artifacts.require('./USDCInterestRateModel.sol')
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const P2WSH = artifacts.require('./P2WSH.sol');
const Med = artifacts.require('./MedianizerExample.sol');

const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');
const Comptroller = artifacts.require('./Comptroller.sol')

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei, hexToNumberString } = web3.utils;

const BTC_TO_SAT = 10**8

const stablecoins = [ { name: 'DAI', unit: 'ether' } ]

async function getContracts(stablecoin) {
  if (stablecoin == 'DAI') {
    const funds = await Funds.deployed();
    const loans = await Loans.deployed();
    const sales = await Sales.deployed();
    const p2wsh = await P2WSH.deployed();
    const token = await ExampleCoin.deployed();
    const med   = await Med.deployed();

    return { funds, loans, sales, p2wsh, token, med }
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

  contract(`${name} P2WSH`, accounts => {
    const lender = accounts[0]
    const borrower = accounts[1]
    const arbiter = accounts[2]
    const liquidator = accounts[3]
    const liquidator2 = accounts[4]
    const liquidator3 = accounts[5]

    let lenderBTC, borrowerBTC, arbiterBTC

    let currentTime
    let btcPrice

    const loanReq = 20; // 5 DAI
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

      const { funds, loans, sales, p2wsh, token, med } = await getContracts(name)

      this.funds = funds
      this.loans = loans
      this.sales = sales
      this.p2wsh  = p2wsh
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

    describe('Should generate proper p2wsh', function() {
      it('should generate p2wsh for refundable and seizable collateral', async function() {
        const { owedToLender, owedForLoan, collateral, minCollateralValue, collateralValue } = await getLoanValues(this.loans, this.loan)
        const medValue = await this.med.read.call()
        const collateralSatValues = [collateral, owedToLender, btcPrice, unit]

        const values = getCollateralSatAmounts(collateral, owedToLender, btcPrice, unit);
        assert.equal((values.refundableValue + values.seizableValue), col)

        const colParams = await getCollateralParams(collateralSatValues, this.loans, this.loan)

        const lockAddressParams = [colParams.pubKeys, colParams.secretHashes, colParams.expirations]
        const lockAddresses = await bitcoin.client.loan.collateral.getLockAddresses(...lockAddressParams)

        const refundableInfo = await this.p2wsh.getP2WSH(this.loan, false)
        const seizableInfo = await this.p2wsh.getP2WSH(this.loan, true)

        const testRefundableP2WSH = bitcoinjs.payments.p2wsh({
          redeem: { output: Buffer.from(remove0x(refundableInfo['0']), 'hex'), network: bitcoinjs.networks.regtest },
          network: bitcoinjs.networks.regtest
        })

        const testSeizableP2WSH = bitcoinjs.payments.p2wsh({
          redeem: { output: Buffer.from(remove0x(seizableInfo['0']), 'hex'), network: bitcoinjs.networks.regtest },
          network: bitcoinjs.networks.regtest
        })

        const { refundableAddress, seizableAddress } = lockAddresses

        assert.equal(refundableAddress, testRefundableP2WSH.address)
        assert.equal(seizableAddress, testSeizableP2WSH.address)
      })
    })
  })
})
