const { BigNumber: BN } = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const { time, expectRevert } = require('openzeppelin-test-helpers')
const { ensure0x } = require('@liquality/ethereum-utils')
const { sha256 } = require('@liquality/crypto')

const Funds = artifacts.require('./Funds.sol')
const Loans = artifacts.require('./Loans.sol')
const Sales = artifacts.require('./Sales.sol')
const HotColdWallet = artifacts.require('./HotColdWallet.sol')
const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol")
const utils = require('./helpers/Utils.js')

const { numToBytes32 } = utils;

const { toWei } = web3.utils

const BTC_TO_SAT = 10 ** 8
const YEAR_IN_SECONDS = BN(31536000)
const loanReq = 25
const loanRat = 2
const btcPrice = '9340.23'
const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

const borpubk = '02b4c50d2b6bdc9f45b9d705eeca37e811dfdeb7365bf42f82222f7a4a89868703'
const lendpubk = '03dc23d80e1cf6feadf464406e299ac7fec9ea13c51dfd9abd970758bf33d89bb6'
const arbiterpubk = '02688ce4b6ca876d3e0451e6059c34df4325745c1f7299ebc108812032106eaa32'
const liquidatorpbkh = '7e18e6193db71abb00b70b102677675c27115871'

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

async function increaseTime(seconds) {
  await time.increase(seconds)
}

async function approveAndTransfer(token, spender, contract, amount) {
  await token.transfer(spender, amount)
  await token.approve(contract.address, amount, { from: spender })
}

contract('HotColdWallet', accounts => {
  const deployer = accounts[0]
  const hotWallet = accounts[1]
  const hotWallet2 = accounts[2]
  const otherWallet = accounts[3]
  const arbiter = accounts[4]
  const borrower = accounts[5]
  const liquidator = accounts[6]
  
  beforeEach(async function () {
    this.funds = await Funds.deployed()
    this.loans = await Loans.deployed()
    this.sales = await Sales.deployed()
    this.token = await ExampleCoin.deployed()
    this.hotColdWallet = await HotColdWallet.deployed()
  })

  describe('Constructor', function() {
    it('should allow creation of fund', async function() {
      const fundParams = [
        toSecs({days: 50}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiter,
        false,
        0
      ]

      const createFundTxData = this.funds.contract.methods.create(...fundParams).encodeABI()

      const fundIndexBefore = await this.funds.fundIndex.call()

      await HotColdWallet.new(this.funds.address, this.loans.address, this.sales.address, hotWallet, createFundTxData)

      const fundIndexAfter = await this.funds.fundIndex.call()

      expect(BN(fundIndexBefore).plus(1).toFixed()).to.equal(BN(fundIndexAfter).toFixed())
    })
  })

  describe('callFunds', function() {
    it('should succeed if cold wallet', async function() {
      const newPubKey = '0x02394be3c0449eca5542edcdbe9a55a9eb52dd72c5c70d40cfe15b7bc3f34df965'

      const setPubKeyTxData = this.funds.contract.methods.setPubKey(newPubKey).encodeABI()

      const pubKeyBefore = await this.funds.pubKeys.call(this.hotColdWallet.address)

      await this.hotColdWallet.callFunds(setPubKeyTxData)

      const pubKeyAfter = await this.funds.pubKeys.call(this.hotColdWallet.address)

      expect(pubKeyBefore).to.equal(null)
      expect(pubKeyAfter).to.equal(newPubKey)
    })

    it('should succeed if hot wallet and requesting loan', async function() {
      const fundParams = [
        toSecs({days: 50}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiter,
        false,
        0
      ]

      const createFundTxData = this.funds.contract.methods.create(...fundParams).encodeABI()

      const fundIndexBefore = await this.funds.fundIndex.call()

      const hotColdWallet = await HotColdWallet.new(this.funds.address, this.loans.address, this.sales.address, hotWallet, createFundTxData)

      const fundIndexAfter = await this.funds.fundIndex.call()

      expect(BN(fundIndexBefore).plus(1).toFixed()).to.equal(BN(fundIndexAfter).toFixed())

      const fund = numToBytes32(fundIndexAfter)

      await this.funds.generate(arbiterSechs, { from: arbiter })

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(fund, toWei('100', 'ether'))

      const loanParams = [
        fund,
        borrower,
        toWei(loanReq.toString(), 'ether'),
        col,
        toSecs({days: 2}),
        ~~(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      const requestFundTxData = this.funds.contract.methods.request(...loanParams).encodeABI()

      const loanIndexBefore = await this.loans.loanIndex.call()

      await hotColdWallet.callFunds(requestFundTxData, { from: hotWallet })

      const loanIndexAfter = await this.loans.loanIndex.call()

      expect(BN(loanIndexBefore).plus(1).toFixed()).to.equal(BN(loanIndexAfter).toFixed())
    })

    it('should fail if hot wallet', async function() {
      const newPubKey = '0x02394be3c0449eca5542edcdbe9a55a9eb52dd72c5c70d40cfe15b7bc3f34df965'

      const setPubKeyTxData = this.funds.contract.methods.setPubKey(newPubKey).encodeABI()

      await expectRevert(this.hotColdWallet.callFunds(setPubKeyTxData, { from: hotWallet }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('callLoans', function() {
    it('should succeed if called by hot wallet', async function() {
      const fundParams = [
        toSecs({days: 50}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiter,
        false,
        0
      ]

      const createFundTxData = this.funds.contract.methods.create(...fundParams).encodeABI()

      const fundIndexBefore = await this.funds.fundIndex.call()

      const hotColdWallet = await HotColdWallet.new(this.funds.address, this.loans.address, this.sales.address, hotWallet, createFundTxData)

      const fundIndexAfter = await this.funds.fundIndex.call()

      expect(BN(fundIndexBefore).plus(1).toFixed()).to.equal(BN(fundIndexAfter).toFixed())

      const fund = numToBytes32(fundIndexAfter)

      await this.funds.generate(arbiterSechs, { from: arbiter })

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(fund, toWei('100', 'ether'))

      const loanParams = [
        fund,
        borrower,
        toWei(loanReq.toString(), 'ether'),
        col,
        toSecs({days: 2}),
        ~~(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      const requestFundTxData = this.funds.contract.methods.request(...loanParams).encodeABI()

      const loanIndexBefore = await this.loans.loanIndex.call()

      await hotColdWallet.callFunds(requestFundTxData, { from: hotWallet })

      const loanIndexAfter = await this.loans.loanIndex.call()

      const loan = numToBytes32(loanIndexAfter)

      expect(BN(loanIndexBefore).plus(1).toFixed()).to.equal(BN(loanIndexAfter).toFixed())

      const approveLoanTxData = this.loans.contract.methods.approve(loan).encodeABI()

      await hotColdWallet.callLoans(approveLoanTxData, { from: hotWallet })

      const { approved } = await this.loans.bools.call(loan)
      expect(approved).to.equal(true)
    })

    it('should fail if not hot or cold wallet', async function() {
      const fundParams = [
        toSecs({days: 50}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiter,
        false,
        0
      ]

      const createFundTxData = this.funds.contract.methods.create(...fundParams).encodeABI()

      const fundIndexBefore = await this.funds.fundIndex.call()

      const hotColdWallet = await HotColdWallet.new(this.funds.address, this.loans.address, this.sales.address, hotWallet, createFundTxData)

      const fundIndexAfter = await this.funds.fundIndex.call()

      expect(BN(fundIndexBefore).plus(1).toFixed()).to.equal(BN(fundIndexAfter).toFixed())

      const fund = numToBytes32(fundIndexAfter)

      await this.funds.generate(arbiterSechs, { from: arbiter })

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(fund, toWei('100', 'ether'))

      const loanParams = [
        fund,
        borrower,
        toWei(loanReq.toString(), 'ether'),
        col,
        toSecs({days: 2}),
        ~~(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      const requestFundTxData = this.funds.contract.methods.request(...loanParams).encodeABI()

      const loanIndexBefore = await this.loans.loanIndex.call()

      await hotColdWallet.callFunds(requestFundTxData, { from: hotWallet })

      const loanIndexAfter = await this.loans.loanIndex.call()

      const loan = numToBytes32(loanIndexAfter)

      expect(BN(loanIndexBefore).plus(1).toFixed()).to.equal(BN(loanIndexAfter).toFixed())

      const approveLoanTxData = this.loans.contract.methods.approve(loan).encodeABI()

      await expectRevert(hotColdWallet.callLoans(approveLoanTxData, { from: otherWallet }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('callSales', function() {
    it('should succeed if called by hot wallet', async function() {
      const fundParams = [
        toSecs({days: 50}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiter,
        false,
        0
      ]

      const createFundTxData = this.funds.contract.methods.create(...fundParams).encodeABI()

      const fundIndexBefore = await this.funds.fundIndex.call()

      const hotColdWallet = await HotColdWallet.new(this.funds.address, this.loans.address, this.sales.address, hotWallet, createFundTxData)

      const fundIndexAfter = await this.funds.fundIndex.call()

      expect(BN(fundIndexBefore).plus(1).toFixed()).to.equal(BN(fundIndexAfter).toFixed())

      const fund = numToBytes32(fundIndexAfter)

      await this.funds.generate(arbiterSechs, { from: arbiter })

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(fund, toWei('100', 'ether'))

      const loanParams = [
        fund,
        borrower,
        toWei(loanReq.toString(), 'ether'),
        col,
        toSecs({days: 1}),
        ~~(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      const requestFundTxData = this.funds.contract.methods.request(...loanParams).encodeABI()

      const loanIndexBefore = await this.loans.loanIndex.call()

      await hotColdWallet.callFunds(requestFundTxData, { from: hotWallet })

      const loanIndexAfter = await this.loans.loanIndex.call()

      const loan = numToBytes32(loanIndexAfter)

      expect(BN(loanIndexBefore).plus(1).toFixed()).to.equal(BN(loanIndexAfter).toFixed())

      const approveLoanTxData = this.loans.contract.methods.approve(loan).encodeABI()

      await hotColdWallet.callLoans(approveLoanTxData, { from: hotWallet })

      await this.loans.withdraw(loan, borSecs[0])

      await increaseTime(toSecs({days: 1, minutes: 2}))

      await approveAndTransfer(this.token, liquidator, this.loans, toWei('100', 'ether'))

      const saleIndexBefore = await this.sales.saleIndex.call()

      await this.loans.liquidate(loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })

      const saleIndexAfter = await this.sales.saleIndex.call()

      const sale = numToBytes32(saleIndexAfter)

      const provideSecretSaleTxData = this.sales.contract.methods.provideSecret(sale, liquidatorSecs[0]).encodeABI()

      await hotColdWallet.callSales(provideSecretSaleTxData, { from: hotWallet })

      const { secretD } = await this.sales.secretHashes.call(sale)

      expect(secretD).to.equal(liquidatorSecs[0])
    })

    it('should fail if not hot or cold wallet', async function() {
      const fundParams = [
        toSecs({days: 50}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiter,
        false,
        0
      ]

      const createFundTxData = this.funds.contract.methods.create(...fundParams).encodeABI()

      const fundIndexBefore = await this.funds.fundIndex.call()

      const hotColdWallet = await HotColdWallet.new(this.funds.address, this.loans.address, this.sales.address, hotWallet, createFundTxData)

      const fundIndexAfter = await this.funds.fundIndex.call()

      expect(BN(fundIndexBefore).plus(1).toFixed()).to.equal(BN(fundIndexAfter).toFixed())

      const fund = numToBytes32(fundIndexAfter)

      await this.funds.generate(arbiterSechs, { from: arbiter })

      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(fund, toWei('100', 'ether'))

      const loanParams = [
        fund,
        borrower,
        toWei(loanReq.toString(), 'ether'),
        col,
        toSecs({days: 1}),
        ~~(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      const requestFundTxData = this.funds.contract.methods.request(...loanParams).encodeABI()

      const loanIndexBefore = await this.loans.loanIndex.call()

      await hotColdWallet.callFunds(requestFundTxData, { from: hotWallet })

      const loanIndexAfter = await this.loans.loanIndex.call()

      const loan = numToBytes32(loanIndexAfter)

      expect(BN(loanIndexBefore).plus(1).toFixed()).to.equal(BN(loanIndexAfter).toFixed())

      const approveLoanTxData = this.loans.contract.methods.approve(loan).encodeABI()

      await hotColdWallet.callLoans(approveLoanTxData, { from: hotWallet })

      await this.loans.withdraw(loan, borSecs[0])

      await increaseTime(toSecs({days: 1, minutes: 2}))

      await approveAndTransfer(this.token, liquidator, this.loans, toWei('100', 'ether'))

      const saleIndexBefore = await this.sales.saleIndex.call()

      await this.loans.liquidate(loan, liquidatorSechs[0], ensure0x(liquidatorpbkh), { from: liquidator })

      const saleIndexAfter = await this.sales.saleIndex.call()

      const sale = numToBytes32(saleIndexAfter)

      const provideSecretSaleTxData = this.sales.contract.methods.provideSecret(sale, liquidatorSecs[0]).encodeABI()

      await expectRevert(hotColdWallet.callSales(provideSecretSaleTxData, { from: otherWallet }), 'VM Exception while processing transaction: revert')
    })
  })

  describe('ChangeHot', function() {
    it('should succeed in changing hot wallet if from cold wallet', async function() {
      const hotBefore = await this.hotColdWallet.hot.call()

      await this.hotColdWallet.changeHot(hotWallet2)

      const hotAfter = await this.hotColdWallet.hot.call()

      expect(hotBefore).to.equal(hotWallet)
      expect(hotAfter).to.equal(hotWallet2)
    })

    it('should fail if not cold wallet', async function() {
      await expectRevert(this.hotColdWallet.changeHot(hotWallet2, { from: hotWallet }), 'VM Exception while processing transaction: revert')
    })

    it('should fail if new hot address is null', async function() {
      await expectRevert(this.hotColdWallet.changeHot('0x0000000000000000000000000000000000000000'), 'VM Exception while processing transaction: revert')
    })
  })
})
