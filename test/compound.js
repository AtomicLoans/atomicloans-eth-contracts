const { time, expectRevert, balance } = require('openzeppelin-test-helpers');

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

const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');

const Compound = artifacts.require('./ALCompound.sol');

const utils = require('./helpers/Utils.js');

const { rateToSec, numToBytes32 } = utils;
const { toWei, fromWei } = web3.utils;

const API_ENDPOINT_COIN = "https://atomicloans.io/marketcap/api/v1/"
const BTC_TO_SAT = 10**8

async function fetchCoin(coinName) {
  const url = `${API_ENDPOINT_COIN}${coinName}/`;
  return (await axios.get(url)).data[0].price_usd; // this returns a promise - stored in 'request'
}

contract("Compound", accounts => {
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

    this.funds = await Funds.deployed();
    this.loans = await Loans.deployed();
    this.sales = await Sales.deployed();
    this.token = await ExampleCoin.deployed();

    this.cErc20 = await CErc20.deployed();
    this.cEther = await CEther.deployed();

    this.compound = await Compound.deployed();

    const fundParams = [
      toWei('1', 'ether'),
      toWei('100', 'ether'),
      toSecs({days: 1}),
      toSecs({days: 366}),
      toWei('1.5', 'gether'), // 150% collateralization ratio
      toWei(rateToSec('16.5'), 'gether'), // 16.50%
      toWei(rateToSec('3'), 'gether'), //  3.00%
      toWei(rateToSec('0.75'), 'gether'), //  0.75%
      agent, 
      true
    ]

    this.fund = await this.funds.createCustom.call(...fundParams)
    await this.funds.createCustom(...fundParams)
  })

  describe('push funds', function() {
    it('should allow anyone to push funds to loan fund', async function() {
      // await this.token.transfer(agent, toWei('100', 'ether'))

      // Push funds to loan fund
      await this.token.approve(this.funds.address, toWei('100', 'ether'))
      await this.funds.deposit(this.fund, toWei('100', 'ether'))

      const bal = await this.cErc20.balanceOf.call(this.funds.address)
      console.log('bal', fromWei(bal, 'ether'))

      const bal2 = await this.token.balanceOf.call(this.funds.address)
      console.log('bal2', fromWei(bal2, 'ether'))

      const bal5 = await this.token.balanceOf.call(this.cErc20.address)
      console.log('bal5', fromWei(bal5, 'ether'))

      const bal7 = await this.token.balanceOf.call(lender)
      console.log('bal7', fromWei(bal7, 'ether'))

      // await this.funds.withdraw(this.fund, toWei('100', 'ether'))

      const bal3 = await this.cErc20.balanceOf.call(this.funds.address)
      console.log('bal3', fromWei(bal3, 'ether'))

      const bal4 = await this.token.balanceOf.call(this.funds.address)
      console.log('bal4', fromWei(bal4, 'ether'))

      const bal6 = await this.token.balanceOf.call(lender)
      console.log('bal6', fromWei(bal6, 'ether'))


      await web3.eth.sendTransaction({ to: agent, from: lender, value: toWei('30', 'ether')})

      await this.compound.mintCToken('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', this.cEther.address, toWei('20', 'ether'), { from: agent, value: toWei('20', 'ether') })


      const bal8 = await this.cEther.balanceOf.call(this.funds.address)
      console.log('bal8', fromWei(bal8, 'ether'))


      await this.compound.enterMarket(this.cErc20.address, { from: agent })
      await this.compound.borrow(this.token.address, this.cErc20.address, toWei('10', 'ether'), { from: agent })

      // const bal = await this.token.balanceOf.call(this.funds.address)

      // assert.equal(bal.toString(), toWei('100', 'ether'));
    })

    // it('should allow anyone to push funds to loan fund', async function() {
    //   await this.token.transfer(agent, toWei('100', 'ether'))

    //   // Push funds to loan fund
    //   await this.token.approve(this.funds.address, toWei('100', 'ether'), { from: agent })
    //   await this.funds.deposit(this.fund, toWei('100', 'ether'), { from: agent })

    //   const bal = await this.token.balanceOf.call(this.funds.address)

    //   assert.equal(bal.toString(), toWei('100', 'ether'));
    // })

    // it('should request and complete loan successfully if loan setup correctly', async function() {
    //   // Generate lender secret hashes
    //   await this.funds.generate(lendSechs)

    //   // Generate agent secret hashes
    //   await this.funds.generate(agentSechs, { from: agent })

    //   // Set Lender PubKey
    //   await this.funds.setPubKey(ensure0x(lendpubk))

    //   // Push funds to loan fund
    //   await this.token.approve(this.funds.address, toWei('100', 'ether'))
    //   await this.funds.deposit(this.fund, toWei('100', 'ether'))

    //   // request collateralization ratio 2
    //   const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

    //   const loanParams = [
    //     this.fund,
    //     toWei(loanReq.toString(), 'ether'),
    //     col,
    //     toSecs({days: 2}),
    //     borSechs,
    //     ensure0x(lendpubk)
    //   ]

    //   this.loan = await this.funds.request.call(...loanParams, { from: borrower })
    //   await this.funds.request(...loanParams, { from: borrower })

    //   await this.loans.approve(this.loan)

    //   await this.loans.withdraw(this.loan, borSecs[0], { from: borrower })

    //   // Send funds to borrower so they can repay full
    //   await this.token.transfer(borrower, toWei('1', 'ether'))

    //   await this.token.approve(this.loans.address, toWei('100', 'ether'), { from: borrower })

    //   const owedForLoan = await this.loans.owedForLoan.call(this.loan)
    //   await this.loans.repay(this.loan, owedForLoan, { from: borrower })

    //   await this.loans.accept(this.loan, lendSecs[0]) // accept loan repayment

    //   const off = await this.loans.off.call(this.loan)

    //   assert.equal(off, true);
    // })    
  })
})
