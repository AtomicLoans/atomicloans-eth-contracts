// const { time, shouldFail, balance } = require('openzeppelin-test-helpers');

// const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
// const AutoAtomicLoan = artifacts.require("./AutoAtomicLoan.sol");

// const utils = require('./helpers/Utils.js');

// contract("AutoAtomicLoan", accounts => {
//   const lender = accounts[0]
//   const lenderAuto = accounts[1]
//   const borrower = accounts[2]
//   const bidder1 = accounts[3]
//   const bidder2 = accounts[4]
//   const bidder3 = accounts[5]
//   const bidder4 = accounts[6]
//   const bidder5 = accounts[7]

//   const withdrawIncrement = 21600;
//   const loanIncrement = 1209600;
//   const acceptIncrement = 259200;
//   const biddingIncrement = 1209600;

//   const secretA1 = "0x68205448939c9adbb5ef3af0c56031134f2946e18063b2394ed2fe1359448ce3"
//   const secretHashA1 = "0x51b3905ec6df1c3bfbf4cb1298b8e6af99adda15b3b9e04cf4f39c0dd5f51c00"
//   const secretA2 = "0x97b7ef7fb05bed6764c2a0666e5f55a733707867b28fd57070ffb42621b342c0"
//   const secretHashA2 = "0x04a95cdf6dfed8dd8aa94a7b01b9f4c6184067f0b1eea4e5c4deb4294389c14e"
//   const secretB1 = "0xdddf8b9aa365fccfcd65788a8b90f826b95a538dd13d3498f11c7d3ca6703557"
//   const secretHashB1 = "0xe55d8eaa25b5b1f791ade455dcaabc81211e6fc2e3b72ecc18ad5efbc4e4771d"
//   const secretB2 = "0x29cc07189e8d4f8066a353c137624fc91b30fc2ed83912ddf470a660576f9f2f"
//   const secretHashB2 = "0x54c126152718dc41282a080479c4c6c7f779ef1685613283bdccdecbf16180ce"
//   const secretB3 = "0x1a8546433effa84887e305ee0f5bc65b9c3710f005b8584eab2a105b84d48102"
//   const secretHashB3 = "0x88a2470828db4c29fd15b71af88b41d2e165814624290c3774377166341a7f4f"
//   const secretAutoB1 = "0x22280a828baf7075665304a7a7d1543ee415754dea3d41efd89b01947452954b"
//   const secretHashAutoB1 = "0x6e42e4af6515e2a942e3fa4212711f6f80c055781d0544c76ae5396aeb13bf07"
//   const secretAutoB2 = "0x3296514ff1df981cacf5007e5d0e8a61397279101fe4cb36c1cc0f3312796d14"
//   const secretHashAutoB2 = "0xb81a2ea242afcfa3c7cee00d33521ab0d442859986720a837f83d571165aec23"
//   const secretAutoB3 = "0x4941f226e7b45fb9c648a9e4486ab1d89df2143330228127978722c8075d5d86"
//   const secretHashAutoB3 = "0x69c4c0cd52c6d917510e4c2fe772931be07d857b6f0bc7588b2dcd7f747b9b15"

//   const secretC1 = "0xab6e6b9758f124d3bb2d0ba708c9f2021732228ff415822bf30458c8b69f8006"
//   const secretHashC1 = "0xa650050414bcb6801ed8ad9f2156fc05043e552064fe3359bd89d336ddb638d8"
//   const secretC2 = "0xdecd04dbedc917a07ad1034c6360ffd69263f889b0e1038e89d78cb1ea748daf"
//   const secretHashC2 = "0xdd302447aa616df462dc30308c5d888e955bd5c57c14cd82f78182a6fa26316d"
//   const secretC3 = "0xb2878f93c21f449afae8bcec8896d02394ca0c23c47afa6db014c0387337fe6a"
//   const secretHashC3 = "0x0663476dea483e64c0b3b2927506188f67049a2e039b481e702fb9afdd757123"
//   const secretC4 = "0x3920563009f6c19c9c13c90425a4b5229dd2afe96e6d4f2612fe911c0cb8c646"
//   const secretHashC4 = "0xe785b54c02cbf36d788e5f0545950023e4a6eeaf0c2e3aa409af991c26e25381"
//   const secretC5 = "0x379c43e9f500f4bdce64d2df7bccf11dd929684bc43fbba422cac39226b7f451"
//   const secretHashC5 = "0x6265c21ebae5e86e1b7e8b1f7bc5b61bf407606ed2f51ef87deb643a2c55dc37"

//   const wrongSecret = "0x0fe056fadb66148f72de76ecfe874d74d13b4dd96c616532b2a1d585691ebeb6"
//   const wrongSecretHash = "0x0fe056fadb66148f72de76ecfe874d74d13b4dd96c616532b2a1d585691ebeb6"

//   const lenderSignature = '3045022100deeb1f13b5927b5e32d877f3c42a4b028e2e0ce5010fdb4e7f7b5e2921c1dcd2022068631cb285e8c1be9f061d2968a18c3163b780656f30a049effee640e80d9bff'
//   const borrowerSignature = '3045022100ee80e164622c64507d243bd949217d666d8b16486e153ac6a1f8e04c351b71a502203691bef46236ca2b4f5e60a82a853a33d6712d6a1e7bf9a65e575aeb7328db8c'

//   let currentTime, approveExpiration, loanExpiration, biddingExpiration, seizureExpiration

//   beforeEach(async function () {
//     currentTime = await time.latest();

//     approveExpiration = parseInt(currentTime) + withdrawIncrement;
//     loanExpiration = parseInt(currentTime) + loanIncrement;
//     acceptExpiration = loanExpiration + acceptIncrement;
//     biddingExpiration = loanExpiration + biddingIncrement;

//     this.token = await ExampleCoin.new();
//     this.atomicLoan = await AutoAtomicLoan.new(
//       [ secretHashA1, secretHashA2 ],
//       [ secretHashB1, secretHashB2, secretHashB3 ],
//       [ secretHashAutoB1, secretHashAutoB2, secretHashAutoB3 ],
//       [approveExpiration, loanExpiration, acceptExpiration, biddingExpiration ],
//       borrower,
//       lender,
//       lenderAuto,
//       `1000000000000000000`,
//       `10000000000000000`,
//       `5000000000000000`,
//       '86400',
//       '86400',
//       this.token.address
//     )
//     await this.token.approve(this.atomicLoan.address, `12010000000000000000`);
//     await this.token.transfer(borrower, `10000000000000000`, { from: lender });
//     await this.token.transfer(bidder1, `1800000000000000000`, { from: lender });
//     await this.token.transfer(bidder2, `1900000000000000000`, { from: lender });
//     await this.token.transfer(bidder3, `2000000000000000000`, { from: lender });
//     await this.token.transfer(bidder4, `2100000000000000000`, { from: lender });
//     await this.token.transfer(bidder5, `2200000000000000000`, { from: lender });
//   })

//   // describe('fund', function() {
//   //   it('should succeed if msg.sender is lender and has necesary principal', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     const funded = await this.atomicLoan.funded.call();
//   //     assert.equal(funded, true);
//   //   })

//   //   it('should fail if lender doesn\'t have the necessary principal', async function() {
//   //     await this.token.transfer(borrower, `1010000000000000000`, { from: lender })
//   //     try {
//   //       await await this.atomicLoan.fund({ from: lender });
//   //     } catch (error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })

//   //   it('should fail msg.sender is not the lender', async function() {
//   //     try {
//   //       await this.atomicLoan.fund({ from: borrower });
//   //     } catch (error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })

//   //   it('should fail if already funded', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     try {
//   //       await this.atomicLoan.fund({ from: lender });
//   //     } catch (error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })
//   // })

//   // describe('approve', function() {
//   //   it('should succeed if msg.sender is lender, is funded, before approveExpiration and hash of secret is secretHashB1', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     await this.atomicLoan.approve(secretB1, { from: lender });
//   //     assert.equal((await this.atomicLoan.approved.call()), true);
//   //   })

//   //   it('should succeed if msg.sender is autoLender, is funded, before approveExpiration and hash of secret is secretHashB1', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     await this.atomicLoan.approve(secretAutoB1, { from: lenderAuto });
//   //     assert.equal((await this.atomicLoan.approved.call()), true);
//   //   })

//   //   it('should fail if not funded', async function() {
//   //     try {
//   //       await this.atomicLoan.approve(secretB1, { from: lender });
//   //     } catch(error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })

//   //   it('should fail if hash of secret provided does not equal secretHashB1', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     try {
//   //       await this.atomicLoan.approve(secretB2, { from: lender });
//   //     } catch(error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })

//   //   it('should fail if hash of secret provided does not equal secretHashAutoB1', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     try {
//   //       await this.atomicLoan.approve(secretAutoB2, { from: lenderAuto });
//   //     } catch(error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })

//   //   it('should fail if current time is greater than approveExpiration', async function() {
//   //     await time.increase(withdrawIncrement + 1);
//   //     await this.atomicLoan.fund({ from: lender });
//   //     try {
//   //       await this.atomicLoan.approve(secretB1, { from: lender });
//   //     } catch(error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })
//   // })

//   // describe('accept_or_cancel', function() {
//   //   it('should succeed canceling if correct secretB2, timestamp greater than approveExpiration and less than paybackAcceptanceExpiration and bidding is false, and msg.sender is lender', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await time.increase(withdrawIncrement + 1);
//   //     await this.atomicLoan.accept_or_cancel(secretB2, { from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //   })

//   //   it('should succeed canceling if correct secretAutoB2, timestamp greater than approveExpiration and less than paybackAcceptanceExpiration and bidding is false, and msg.sender is lenderAuto', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await time.increase(withdrawIncrement + 1);
//   //     await this.atomicLoan.accept_or_cancel(secretAutoB2, { from: lenderAuto });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //   })

//   //   it('should succeed canceling if correct secretAutoB2, timestamp greater than approveExpiration and less than paybackAcceptanceExpiration and bidding is false and msg.sender is lenderAuto', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await time.increase(withdrawIncrement + 1);
//   //     await this.atomicLoan.accept_or_cancel(secretAutoB2, { from: lenderAuto });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //   })

//   //   it('should succeed accepting repayment if correct secretB2, timestamp greater than approveExpiration and less than paybackAcceptanceExpiration and bidding is false', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await this.atomicLoan.payback({ from: borrower })
//   //     await this.atomicLoan.accept_or_cancel(secretB2, { from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2010000000000000000');
//   //   })

//   //   it('should succeed accepting repayment if correct secretAutoB2, timestamp greater than approveExpiration and less than paybackAcceptanceExpiration and bidding is false and msg.sender is lenderAuto', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await this.atomicLoan.payback({ from: borrower })
//   //     await this.atomicLoan.accept_or_cancel(secretAutoB2, { from: lenderAuto });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2010000000000000000');
//   //   })

//   //   it('should fail if hash of secret is not secretHashB2', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     await time.increase(withdrawIncrement + 1);
//   //     await shouldFail.reverting(this.atomicLoan.accept_or_cancel(secretB1, { from: lender }))
//   //   })

//   //   it('should fail if current time is less than approveExpiration', async function() {
//   //     await this.atomicLoan.fund({ from: lender }); 
//   //     await shouldFail.reverting(this.atomicLoan.accept_or_cancel(secretB2, { from: lender }))
//   //   })

//   //   it('should fail if current time is less than approveExpiration lenderAuto', async function() {
//   //     await this.atomicLoan.fund({ from: lender }); 
//   //     await shouldFail.reverting(this.atomicLoan.accept_or_cancel(secretAutoB2, { from: lenderAuto }))
//   //   })

//   //   it('should fail if current time is greater than acceptExpiration', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     await time.increase(loanIncrement + acceptIncrement + 1);
//   //     await shouldFail.reverting(this.atomicLoan.accept_or_cancel(secretB2, { from: lender }))
//   //   })

//   //   it('should fail if current time is greater than acceptExpiration lenderAuto', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     await time.increase(loanIncrement + acceptIncrement + 1);
//   //     await shouldFail.reverting(this.atomicLoan.accept_or_cancel(secretAutoB2, { from: lenderAuto }))
//   //   })

//   //   it('should fail if bidding state is true', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await shouldFail.reverting(this.atomicLoan.accept_or_cancel(secretB2, { from: lender }))
//   //   })

//   //   it('should fail if bidding state is true lenderAuto', async function() {
//   //     await this.atomicLoan.fund({ from: lender });
//   //     await this.atomicLoan.approve(secretAutoB1, { from: lenderAuto })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lenderAuto })
//   //     await shouldFail.reverting(this.atomicLoan.accept_or_cancel(secretAutoB2, { from: lenderAuto }))
//   //   })
//   // })

//   // describe('payback', function() {
//   //   it('should succeed if withdrawn, current time is less than or equal to loanExpiration and msg.sender is the borrower', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await this.atomicLoan.payback({ from: borrower })
//   //     assert.equal((await this.atomicLoan.repaid.call()), true)
//   //     assert.equal((await this.token.balanceOf(this.atomicLoan.address)), '1010000000000000000')
//   //     assert.equal((await this.token.balanceOf(borrower)), '0')
//   //     assert.equal((await this.token.balanceOf(lender)), '1000000000000000000')
//   //   })

//   //   it('should fail if not withdrawn', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await shouldFail.reverting(this.atomicLoan.payback({ from: borrower }))
//   //   })

//   //   it('should fail if current time is greater than loanExpiration', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await shouldFail.reverting(this.atomicLoan.payback({ from: borrower }))
//   //   })

//   //   it('should fail if msg.sender is not borrower', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.token.transfer(lender, `10000000000000000`, { from: borrower });
//   //     await shouldFail.reverting(this.atomicLoan.payback({ from: lender }))
//   //   })
//   // })

//   // describe('refundPayback', function() {
//   //   it('should succeed if repaid and current time is greater than acceptExpiration and msg.sender is borrower', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await this.atomicLoan.payback({ from: borrower })
//   //     assert.equal((await this.atomicLoan.repaid.call()), true)
//   //     await time.increase(acceptIncrement + 11)
//   //     await this.atomicLoan.refundPayback({ from: borrower })
//   //   })

//   //   it('should fail if current time is less than acceptExpiration', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await this.atomicLoan.payback({ from: borrower })
//   //     assert.equal((await this.atomicLoan.repaid.call()), true)
//   //     await shouldFail.reverting(this.atomicLoan.refundPayback({ from: borrower }))
//   //   })

//   //   it('should fail if not repaid', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await shouldFail.reverting(this.atomicLoan.refundPayback({ from: borrower }))
//   //   })

//   //   it('should fail if msg.sender is not the borrower', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await this.atomicLoan.payback({ from: borrower })
//   //     assert.equal((await this.atomicLoan.repaid.call()), true)
//   //     await time.increase(acceptIncrement + 11)
//   //     await shouldFail.reverting(this.atomicLoan.refundPayback({ from: lender }))
//   //   })
//   // })

//   // describe('startBidding', function() {
//   //   it('should success if withdrawn and not repaid, current time is greater than loanExpiration and msg.sender is lender', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //   })

//   //   it('should success if withdrawn and not repaid, current time is greater than loanExpiration and msg.sender is lenderAuto', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await this.atomicLoan.startBidding({ from: lenderAuto })
//   //   })

//   //   it('should success if withdrawn and not repaid, current time is greater than loanExpiration and msg.sender is borrower', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await this.atomicLoan.startBidding({ from: borrower })
//   //   })

//   //   it('should fail if repaid', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     await this.token.approve(this.atomicLoan.address, '1010000000000000000', { from: borrower })
//   //     await this.atomicLoan.payback({ from: borrower })
//   //     await time.increase(11);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), true)
//   //     await shouldFail.reverting(this.atomicLoan.startBidding({ from: lender }))
//   //   })

//   //   it('should fail if not withdrawn', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await time.increase(loanIncrement + 1);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), false)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await shouldFail.reverting(this.atomicLoan.startBidding({ from: lender }))
//   //   })

//   //   it('should fail if not withdrawn', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretAutoB1, { from: lenderAuto })
//   //     await time.increase(loanIncrement + 1);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), false)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await shouldFail.reverting(this.atomicLoan.startBidding({ from: lenderAuto }))
//   //   })

//   //   it('should fail if current time is less than loanExpiration', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await shouldFail.reverting(this.atomicLoan.startBidding({ from: lender }))
//   //   })

//   //   it('should fail if current time is less than loanExpiration lenderAuto', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretAutoB1, { from: lenderAuto })
//   //     await this.atomicLoan.withdraw(secretA1, secretAutoB1, { from: borrower })
//   //     await time.increase(loanIncrement - 10);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await shouldFail.reverting(this.atomicLoan.startBidding({ from: lenderAuto }))
//   //   })

//   //   it('should fail if msg.sender is not the lender or borrower', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     await shouldFail.reverting(this.atomicLoan.startBidding({ from: bidder1 }))
//   //   })
//   // })

//   // describe('bid', function() {
//   //   it('should succeed if current time greater than loanExpiration and less than biddingTimeoutExpiration, \
//   //     bidding state is true, bid value is greater than current bid value, and \
//   //     token balance of msg.sender is greater or equal to bid value', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //   })

//   //   it('should succeed if there are two bidders', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     await this.token.approve(this.atomicLoan.address, `1900000000000000000`, { from: bidder2 })
//   //     await this.atomicLoan.bid(secretHashC1, '1900000000000000000', 'mfreT8oeJGrL8QwGvifd38DjWyYNvNGDZq', { from: bidder2 })
//   //     assert.equal((await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     assert.equal((await this.token.balanceOf(bidder2)), '0')
//   //   })

//   //   it('should succeed if there is multiple bidders', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     await this.token.approve(this.atomicLoan.address, `1900000000000000000`, { from: bidder2 })
//   //     await this.atomicLoan.bid(secretHashC2, '1900000000000000000', 'mtZzU3L2wTYZMEYhMgge825oGBHsQ4XWsT', { from: bidder2 })
//   //     assert.equal((await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     assert.equal((await this.token.balanceOf(bidder2)), '0')
//   //     await this.token.approve(this.atomicLoan.address, `2000000000000000000`, { from: bidder3 })
//   //     await this.atomicLoan.bid(secretHashC3, '2000000000000000000', 'mkGZCVK1E5Cbd8bLMcFUkrPK93fq2U1G5o', { from: bidder3 })
//   //     await this.token.approve(this.atomicLoan.address, `2100000000000000000`, { from: bidder4 })
//   //     await this.atomicLoan.bid(secretHashC4, '2100000000000000000', 'mnhdnxnswPQXDPsq4nVH6zTHYpg17zqHvF', { from: bidder4 })
//   //     await this.token.approve(this.atomicLoan.address, `2200000000000000000`, { from: bidder5 })
//   //     await this.atomicLoan.bid(secretHashC5, '2200000000000000000', 'mr9CCrXod3r5K5DNuTpkEKwD7y6aKVgqKc', { from: bidder5 })
//   //     assert.equal((await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     assert.equal((await this.token.balanceOf(bidder2)), '1900000000000000000')
//   //     assert.equal((await this.token.balanceOf(bidder3)), '2000000000000000000')
//   //     assert.equal((await this.token.balanceOf(bidder4)), '2100000000000000000')
//   //     assert.equal((await this.token.balanceOf(bidder5)), '0')
//   //   })

//   //   it('should fail if next bidder has same bid value', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder2 })
//   //     await shouldFail.reverting(this.atomicLoan.bid(secretHashC2, '1800000000000000000', 'mtZzU3L2wTYZMEYhMgge825oGBHsQ4XWsT', { from: bidder2 }))
//   //   })

//   //   it('should fail if not in bidding state', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), false)
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     await shouldFail.reverting(this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 }))
//   //   })

//   //   it('should fail if current time is greater than biddingTimeoutExpiration', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await time.increase(86400 + 1);
//   //     await shouldFail.reverting(this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 }))
//   //   })

//   //   it('should fail if bidder token balance is less than bid value', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await this.token.transfer(lender, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.token.balanceOf(bidder1)), '0')
//   //     await shouldFail.reverting(this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 }))
//   //   })
//   // })

//   // describe('provideSignature', async function() {
//   //   it('should succeed if msg.sender is lender', async function() {
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.provideSignature(lenderSignature, { from: lender })
//   //     assert.equal((await this.atomicLoan.lenderSignature.call()), lenderSignature)
//   //   })

//   //   it('should succeed if msg.sender is borrower', async function() {
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.provideSignature(borrowerSignature, { from: borrower })
//   //     assert.equal((await this.atomicLoan.borrowerSignature.call()), borrowerSignature)
//   //   })

//   //   it('should fail if msg.sender is not borrower or lender', async function() {
//   //     await time.increase(loanIncrement + 1);
//   //     await shouldFail.reverting(this.atomicLoan.provideSignature(borrowerSignature, { from: bidder1 }))
//   //   })
//   // })

//   // describe('provideSecret', async function() {
//   //   it('should succeed if msg.sender is borrower and hash of _secret is secretHashA2', async function() {
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.provideSecret(secretA2, { from: borrower })
//   //     assert.equal((await this.atomicLoan.secretA2.call()), secretA2)
//   //   })

//   //   it('should succeed if msg.sender is lender and hash of _secret is secretHashB2', async function() {
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.provideSecret(secretB3, { from: lender })
//   //     assert.equal((await this.atomicLoan.secretB3.call()), secretB3)
//   //   })

//   //   it('should succeed if msg.sender is bidder and hash of _secret is secretHashC', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1);
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     await this.atomicLoan.provideSecret(secretC1, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.secretC.call()), secretC1)
//   //   })
//   // })

//   // describe('withdrawLiquidatedCollateral', function() {
//   //   beforeEach(async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     await this.atomicLoan.provideSignature(borrowerSignature, { from: borrower })
//   //     await this.atomicLoan.provideSignature(lenderSignature, { from: lender })
//   //     await this.atomicLoan.provideSecret(secretC1, { from: bidder1 })
//   //     await this.atomicLoan.provideSecret(secretA2, { from: borrower })
//   //     await this.atomicLoan.provideSecret(secretB3, { from: lender })
//   //     assert.equal(parseInt(await this.token.balanceOf(borrower)), '1010000000000000000')
//   //     assert.equal(parseInt(await this.token.balanceOf(lender)), '1000000000000000000')
//   //   })

//   //   it('should succeed if current time is less than biddingTimeoutExpiration, hash of _secretA2 equals secretHashA2\
//   //     hash of _secretB2 equals secretHashB2, and hash of _secretC is secretHashC and msg.sender is borrower', async function() {
//   //     await time.increase(86400 + 1)
//   //     await this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretB3, secretC1, { from: borrower })
//   //     assert.equal(parseInt(await this.token.balanceOf(borrower)), '1795000000000000000')
//   //     assert.equal(parseInt(await this.token.balanceOf(lender)), '2015000000000000000')
//   //   })

//   //   it('should succeed if current time is less than biddingTimeoutExpiration, hash of _secretA2 equals secretHashA2\
//   //     hash of _secretAutoB2 equals secretHashB2, and hash of _secretC is secretHashC and msg.sender is borrower', async function() {
//   //     await time.increase(86400 + 1)
//   //     await this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretAutoB3, secretC1, { from: borrower })
//   //     assert.equal(parseInt(await this.token.balanceOf(borrower)), '1795000000000000000')
//   //     assert.equal(parseInt(await this.token.balanceOf(lender)), '2015000000000000000')
//   //   })

//   //   it('should succeed if current time is less than biddingTimeoutExpiration, hash of _secretA2 equals secretHashA2\
//   //     hash of _secretB2 equals secretHashB2, and hash of _secretC is secretHashC and msg.sender is lender', async function() {
//   //     await time.increase(86400 + 1)
//   //     await this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretB3, secretC1, { from: lender })
//   //     assert.equal(parseInt(await this.token.balanceOf(borrower)), '1795000000000000000')
//   //     assert.equal(parseInt(await this.token.balanceOf(lender)), '2015000000000000000')
//   //   })

//   //   it('should succeed if current time is less than biddingTimeoutExpiration, hash of _secretA2 equals secretHashA2\
//   //     hash of _secretAutoB2 equals secretHashAutoB2, and hash of _secretC is secretHashC and msg.sender is lender', async function() {
//   //     await time.increase(86400 + 1)
//   //     await this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretAutoB3, secretC1, { from: lender })
//   //     assert.equal(parseInt(await this.token.balanceOf(borrower)), '1795000000000000000')
//   //     assert.equal(parseInt(await this.token.balanceOf(lender)), '2015000000000000000')
//   //   })

//   //   it('should fail if msg.sender is not lender or borrower', async function() {
//   //     await time.increase(86400 + 1)
//   //     await shouldFail.reverting(this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretB2, secretC1, { from: bidder1 }))
//   //   })

//   //   it('should fail if msg.sender is not lenderAuto or borrower', async function() {
//   //     await time.increase(86400 + 1)
//   //     await shouldFail.reverting(this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretAutoB2, secretC1, { from: bidder1 }))
//   //   })

//   //   it('should fail if current time is less than biddingTimeoutExpiration', async function() {
//   //     await shouldFail.reverting(this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretB2, secretC1, { from: lender }))
//   //   })

//   //   it('should fail secretA2 is incorrect', async function() {
//   //     await shouldFail.reverting(this.atomicLoan.withdrawLiquidatedCollateral(wrongSecret, secretB2, secretC1, { from: lender }))
//   //   })

//   //   it('should fail secretB2 is incorrect', async function() {
//   //     await shouldFail.reverting(this.atomicLoan.withdrawLiquidatedCollateral(secretA2, wrongSecret, secretC1, { from: lender }))
//   //   })

//   //   it('should fail secretC is incorrect', async function() {
//   //     await shouldFail.reverting(this.atomicLoan.withdrawLiquidatedCollateral(secretA2, secretB2, wrongSecret, { from: bidder1 }))
//   //   })
//   // })

//   // describe('refundBid', async function() {
//   //   it('should succeed if current time is greater than biddingRefundExpiration, the correct secrets have not been revealed\
//   //     and current bid greater than zero', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '0')
//   //     await time.increase(86400 + 86400 + 1)
//   //     await this.atomicLoan.refundBid({ from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //   })

//   //   it('should succeed if current time is greater than biddingRefundExpiration, the correct secrets have not been revealed\
//   //     and current bid greater than zero and caller is lenderAuto', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '0')
//   //     await time.increase(86400 + 86400 + 1)
//   //     await this.atomicLoan.refundBid({ from: lenderAuto })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //   })

//   //   it('should fail if current time less than biddingRefundExpiration', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '0')
//   //     await time.increase(86400 + 86400 - 10)
//   //     await shouldFail.reverting(this.atomicLoan.refundBid({ from: bidder1 }))
//   //   })

//   //   it('should fail if all the secrets are correct', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '0')
//   //     await this.atomicLoan.provideSignature(borrowerSignature, { from: borrower })
//   //     await this.atomicLoan.provideSignature(lenderSignature, { from: lender })
//   //     await this.atomicLoan.provideSecret(secretC1, { from: bidder1 })
//   //     await this.atomicLoan.provideSecret(secretA2, { from: borrower })
//   //     await this.atomicLoan.provideSecret(secretB3, { from: lender })
//   //     await time.increase(86400 + 86400 + 1)
//   //     await shouldFail.reverting(this.atomicLoan.refundBid({ from: bidder1 }))
//   //   })

//   //   it('should fail if all the secrets are correct', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '0')
//   //     await this.atomicLoan.provideSignature(borrowerSignature, { from: borrower })
//   //     await this.atomicLoan.provideSignature(lenderSignature, { from: lender })
//   //     await this.atomicLoan.provideSecret(secretC1, { from: bidder1 })
//   //     await this.atomicLoan.provideSecret(secretA2, { from: borrower })
//   //     await this.atomicLoan.provideSecret(secretAutoB3, { from: lenderAuto })
//   //     await time.increase(86400 + 86400 + 1)
//   //     await shouldFail.reverting(this.atomicLoan.refundBid({ from: bidder1 }))
//   //   })

//   //   it('should succeed if one of the secrets is not provided', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     await this.atomicLoan.bid(secretHashC1, '1800000000000000000', 'mfaWz3aK5MCGsdPypX7DBAfxpY1vSRpBJC', { from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '0')
//   //     await this.atomicLoan.provideSignature(borrowerSignature, { from: borrower })
//   //     await this.atomicLoan.provideSignature(lenderSignature, { from: lender })
//   //     await this.atomicLoan.provideSecret(secretC1, { from: bidder1 })
//   //     await this.atomicLoan.provideSecret(secretA2, { from: borrower })
//   //     await time.increase(86400 + 86400 + 1)
//   //     await this.atomicLoan.refundBid({ from: bidder1 })
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //   })

//   //   it('should fail if current bid is zero', async function() {
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('2000000000000000000');
//   //     await this.atomicLoan.fund({ from: lender });
//   //     (await this.token.balanceOf(lender)).should.be.bignumber.equal('1000000000000000000');
//   //     await this.atomicLoan.approve(secretB1, { from: lender })
//   //     await this.atomicLoan.withdraw(secretA1, secretB1, { from: borrower })
//   //     await time.increase(loanIncrement + 1)
//   //     await this.atomicLoan.startBidding({ from: lender })
//   //     await this.token.approve(this.atomicLoan.address, `1800000000000000000`, { from: bidder1 })
//   //     assert.equal((await this.atomicLoan.withdrawn.call()), true)
//   //     assert.equal((await this.atomicLoan.repaid.call()), false)
//   //     assert.equal((await this.atomicLoan.bidding.call()), true)
//   //     assert.equal(parseInt(await this.token.balanceOf(bidder1)), '1800000000000000000')
//   //     await time.increase(86400 + 86400 + 1)
//   //     await shouldFail.reverting(this.atomicLoan.refundBid({ from: bidder1 }))
//   //   })
//   // })
// });
