const { time, shouldFail, balance } = require('openzeppelin-test-helpers');

const toSecs        = require('@mblackmblack/to-seconds');
const { sha256 }    = require('@liquality/crypto')
const { ensure0x }  = require('@liquality/ethereum-utils');
const { BigNumber } = require('bignumber.js');
const axios         = require('axios');

const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const Funds = artifacts.require("./Funds.sol");
const Loans = artifacts.require("./Loans.sol");
const Sales = artifacts.require("./Sales.sol");
const Med   = artifacts.require("./Medianizer.sol");
const Cur   = artifacts.require('./BTCCurrency.sol');
const Vars  = artifacts.require('./VarsExample.sol');

const utils = require('./helpers/Utils.js');

const API_ENDPOINT_COIN = "https://atomicloans.io/marketcap/api/v1/"
const BTC_TO_SAT = 10**8

async function fetchCoin(coinName) {
  const url = `${API_ENDPOINT_COIN}${coinName}/`;
  return (await axios.get(url)).data[0].price_usd; // this returns a promise - stored in 'request'
}

contract("Funds", accounts => {
  const lender = accounts[0]
  const borrower = accounts[1]
  const agent = accounts[2]

  let currentTime
  let btcPrice

  const loanReq = 1; // 5 DAI
  const loanRat = 2; // Collateralization ratio of 200%

  let lendSecs = []
  let lendSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    lendSecs.push(ensure0x(sec))
    lendSechs.push(ensure0x(sha256(sec)))
  }
  const lendpubk = '034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'

  let borSecs = []
  let borSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    borSecs.push(ensure0x(sec))
    borSechs.push(ensure0x(sha256(sec)))
  }

  let agentSecs = []
  let agentSechs = []
  for (let i = 0; i < 4; i++) {
    let sec = sha256(Math.random().toString())
    agentSecs.push(ensure0x(sec))
    agentSechs.push(ensure0x(sha256(sec)))
  }

  beforeEach(async function () {
    currentTime = await time.latest();
    // btcPrice = await fetchCoin('bitcoin')
    btcPrice = '9340.23'
    console.log('btcPrice')
    console.log(btcPrice)

    this.funds = await Funds.deployed();
    this.loans = await Loans.deployed();
    this.sales = await Sales.deployed();
    this.token = await ExampleCoin.deployed();
    this.cur   = await Cur.deployed();
    this.vars  = await Vars.deployed();

    console.log('ratetosec')
    console.log(utils.rateToSec('16.5'))

    const fundParams = [
      web3.utils.toWei('1', 'ether'),
      web3.utils.toWei('100', 'ether'),
      toSecs({days: 1}),
      toSecs({days: 366}),
      web3.utils.toWei('1.5', 'gether'), // 150% collateralization ratio
      web3.utils.toWei(utils.rateToSec('16.5'), 'gether'), // 16.50%
      web3.utils.toWei(utils.rateToSec('3'), 'gether'), //  3.00%
      web3.utils.toWei(utils.rateToSec('0.75'), 'gether'), //  0.75%
      agent,
      this.token.address,
      this.cur.address,
      this.vars.address
    ]

    this.fund = await this.funds.open.call(...fundParams)
    await this.funds.open(...fundParams)

    // Generate lender secret hashes
    await this.funds.gen(lendSechs)

    // Generate agent secret hashes
    await this.funds.gen(agentSechs, { from: agent })

    // Set Lender PubKey
    await this.funds.set(ensure0x(lendpubk))

    // Push funds to loan fund
    await this.token.approve(this.funds.address, web3.utils.toWei('100', 'ether'))
    await this.funds.push(this.fund, web3.utils.toWei('100', 'ether'))
  })

  describe('fund', function() {
    it('should succeed if msg.sender is lender and has necesary principal', async function() {
      const tokenAddress = await this.funds.toka.call(this.fund)
      assert.equal(this.token.address, tokenAddress);

      // request collateralization ratio 2
      const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      const loanParams = [
        this.fund,
        web3.utils.toWei(loanReq.toString(), 'ether'),
        col,
        toSecs({days: 2}),
        borSechs,
        ensure0x(lendpubk)
      ]

      this.loan = await this.funds.req.call(...loanParams, { from: borrower })
      await this.funds.req(...loanParams, { from: borrower })

      await this.loans.mark(this.loan)

      await this.loans.take(this.loan, borSecs[0], { from: borrower })

      const bal = await this.token.balanceOf.call(borrower)
      // assert.equal(bal, web3.utils.toWei('1', 'ether'))

      // Send funds to borrower so they can repay full
      await this.token.transfer(borrower, web3.utils.toWei('1', 'ether'))

      await this.token.approve(this.loans.address, web3.utils.toWei('100', 'ether'), { from: borrower })

      const owed = await this.loans.owed.call(this.loan)
      await this.loans.pay(this.loan, owed, { from: borrower })

      await this.loans.pull(this.loan, lendSecs[0])

      const lendBal = await this.token.balanceOf.call(this.funds.address)
      console.log(lendBal)


    })
  })
})