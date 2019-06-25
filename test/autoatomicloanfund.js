// const { time, shouldFail, balance } = require('openzeppelin-test-helpers');

// const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
// const AutoAtomicLoanFund = artifacts.require("./AutoAtomicLoanFund.sol");
// const AutoAtomicLoan = artifacts.require("./AutoAtomicLoan.sol");

// const utils = require('./helpers/Utils.js');

// contract("AutoAtomicLoanFund", accounts => {
//   const lender = accounts[0]
//   const lenderAuto = accounts[1]
//   const borrower1 = accounts[2]
//   const borrower2 = accounts[3]
//   const borrower3 = accounts[4]
//   const bidder1 = accounts[5]
//   const bidder2 = accounts[6]
//   const bidder3 = accounts[7]
//   const bidder4 = accounts[8]
//   const bidder5 = accounts[9]

//   const withdrawIncrement = 21600;
//   const loanIncrement = 1209600;
//   const acceptIncrement = 259200;
//   const biddingIncrement = 1209600;

//   const secretA1_1 = "0x68205448939c9adbb5ef3af0c56031134f2946e18063b2394ed2fe1359448ce3"
//   const secretHashA1_1 = "0x51b3905ec6df1c3bfbf4cb1298b8e6af99adda15b3b9e04cf4f39c0dd5f51c00"
//   const secretA2_1 = "0x97b7ef7fb05bed6764c2a0666e5f55a733707867b28fd57070ffb42621b342c0"
//   const secretHashA2_1 = "0x04a95cdf6dfed8dd8aa94a7b01b9f4c6184067f0b1eea4e5c4deb4294389c14e"

//   const secretA1_2 = "0xda2fd4dadb3707ec45a15db87bdab0e14d7ecb1dbcad44d8234c7be0325fcddc"
//   const secretHashA1_2 = "0xc8875e5e6519f4f2d997e231cbf92ce6f17c47d2e1812bd3a90b04f4bd6fe9a1"
//   const secretA2_2 = "0x5641150971830e0cfd377a4e590b97f900902b1da8feb2ef3eb72f422e6606c9"
//   const secretHashA2_2 = "0x8b86835ec4361c34f4c1eda9d2374448ac5efdfd208724732feb2bf7f4bba573"

//   const secretA1_3 = "0x64c9be3361b7fd4d4e1458a1d3a7d17c9858b04d2512719aa0c4db102576527d"
//   const secretHashA1_3 = "0x677cbf2b7fc97d7ae3977c8808e7cc250a96746ce1f7d0294b414fb91b00bae7"
//   const secretA2_3 = "0x9f7259d05ac4a50c60d298bb1bf3c3821f0c88fff298ffdf37bc7304400535d7"
//   const secretHashA2_3 = "0x55de4870a654f460a6deafe89d5a1e6dba380a8cae222a90ff3fee5902d1eaad"

//   const secretB1_1 = "0xdddf8b9aa365fccfcd65788a8b90f826b95a538dd13d3498f11c7d3ca6703557"
//   const secretHashB1_1 = "0xe55d8eaa25b5b1f791ade455dcaabc81211e6fc2e3b72ecc18ad5efbc4e4771d"
//   const secretB2_1 = "0x29cc07189e8d4f8066a353c137624fc91b30fc2ed83912ddf470a660576f9f2f"
//   const secretHashB2_1 = "0x54c126152718dc41282a080479c4c6c7f779ef1685613283bdccdecbf16180ce"
//   const secretB3_1 = "0x1a8546433effa84887e305ee0f5bc65b9c3710f005b8584eab2a105b84d48102"
//   const secretHashB3_1 = "0x88a2470828db4c29fd15b71af88b41d2e165814624290c3774377166341a7f4f"

//   const secretAutoB1_1 = "0x22280a828baf7075665304a7a7d1543ee415754dea3d41efd89b01947452954b"
//   const secretHashAutoB1_1 = "0x6e42e4af6515e2a942e3fa4212711f6f80c055781d0544c76ae5396aeb13bf07"
//   const secretAutoB2_1 = "0x3296514ff1df981cacf5007e5d0e8a61397279101fe4cb36c1cc0f3312796d14"
//   const secretHashAutoB2_1 = "0xb81a2ea242afcfa3c7cee00d33521ab0d442859986720a837f83d571165aec23"
//   const secretAutoB3_1 = "0x4941f226e7b45fb9c648a9e4486ab1d89df2143330228127978722c8075d5d86"
//   const secretHashAutoB3_1 = "0x69c4c0cd52c6d917510e4c2fe772931be07d857b6f0bc7588b2dcd7f747b9b15"

//   const secretB1_2 = "0x3296514ff1df981cacf5007e5d0e8a61397279101fe4cb36c1cc0f3312796d14"
//   const secretHashB1_2 = "0xb81a2ea242afcfa3c7cee00d33521ab0d442859986720a837f83d571165aec23"
//   const secretB2_2 = "0x33d4a28185f611e9f2c7167c6d9a28cefc801bf46e155ab9f4878c1d8ee1b96c"
//   const secretHashB2_2 = "0xd580b0760d075573efa9961db881f09aeee717cbfba2b80afc0d226e045e3c96"
//   const secretB3_2 = "0x4941f226e7b45fb9c648a9e4486ab1d89df2143330228127978722c8075d5d86"
//   const secretHashB3_2 = "0x69c4c0cd52c6d917510e4c2fe772931be07d857b6f0bc7588b2dcd7f747b9b15"

//   const secretB1_3 = "0x0232c870ec20cf668dc7905be550a1fb95ade2aef2c3eb5135dae530bebff281"
//   const secretHashB1_3 = "0x57eef5ee0588764213dcbd3ae212862c96785289fa5126e070cf2dbe65210844"
//   const secretB2_3 = "0x782515cb878425f7704da3f85344f5feeb12703504f8f9ea972ee91fe383ba22"
//   const secretHashB2_3 = "0x84252915e2878fd226f9c05686652a858b808d3742edd8e2947e4a7ffdfce7f8"
//   const secretB3_3 = "0xda5c4be66544099bb2a34105bf3a3c444d7f727409a99669f7be2c1a322e417d"
//   const secretHashB3_3 = "0x38b5a2d1e4bbe0bb027fd54fbcb67922c9526dfe8501e1eb85e33cd0e9c17063"

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

//   beforeEach(async function () {
//     currentTime = await time.latest();

//     this.token = await ExampleCoin.new();
//     this.autoAtomicLoanFund = await AutoAtomicLoanFund.new(
//       [ secretHashB1_1, secretHashB2_1, secretHashB3_1, secretHashB1_2, secretHashB2_2, secretHashB3_2, secretHashB1_3, secretHashB2_3, secretHashB3_3 ],
//       [ secretHashAutoB1_1, secretHashAutoB2_1, secretHashAutoB3_1 ],
//       `500000000000000000`,
//       86400,
//       1209600,
//       7990868,
//       3995434,
//       this.token.address,
//       lenderAuto
//     )
//     await this.token.approve(this.autoAtomicLoanFund.address, `12010000000000000000`, { from: lender });
//     await this.token.transfer(borrower1, `10000000000000000`, { from: lender });
//     await this.token.transfer(bidder1, `1800000000000000000`, { from: lender });
//     await this.token.transfer(bidder2, `1900000000000000000`, { from: lender });
//     await this.token.transfer(bidder3, `2000000000000000000`, { from: lender });
//     await this.token.transfer(bidder4, `2100000000000000000`, { from: lender });
//     await this.token.transfer(bidder5, `2200000000000000000`, { from: lender });
//   })

//   // describe('fund', function() {
//   //   it('should succeed if msg.sender is lender and has necesary principal', async function() {
//   //     await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender });
//   //     const liquidityPoolBalance = await this.token.balanceOf(this.autoAtomicLoanFund.address);
//   //     assert.equal(liquidityPoolBalance, '1000000000000000000');
//   //   })

//   //   it('should fail if lender doesn\'t have the necessary principal', async function() {
//   //     await this.token.transfer(borrower1, `1010000000000000000`, { from: lender })
//   //     try {
//   //       await await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender });
//   //     } catch (error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })

//   //   it('should fail msg.sender is not the lender', async function() {
//   //     try {
//   //       await this.autoAtomicLoanFund.fund('1000000000000000000', { from: borrower1 });
//   //     } catch (error) {
//   //       return utils.ensureException(error);
//   //     }
//   //     assert.fail('Expected exception not received');
//   //   })
//   // })

//   // describe('requestLoan', function() {
//   //   it('should succeed if amount is less than maxLoanAmount and secretHashesA are provided and loanDuration is between max/min LoanDuration', async function() {
//   //     await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender })
//   //     assert.equal((await this.token.balanceOf(this.autoAtomicLoanFund.address)),'1000000000000000000')
//   //     await this.autoAtomicLoanFund.requestLoan('500000000000000000', [ secretHashA1_1, secretHashA2_1 ], 604800, { from: borrower1 })
//   //     const autoAtomicLoanAddress = await this.autoAtomicLoanFund.atomicLoanContracts.call(0)
//   //     const autoAtomicLoan = await AutoAtomicLoan.at(autoAtomicLoanAddress)
//   //     const funded = await autoAtomicLoan.funded.call()
//   //     assert.equal(funded, true)
//   //   })

//   //   it('should fail if amount is greater than maxLoanAmount', async function() {
//   //     await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender });
//   //     await shouldFail.reverting(this.autoAtomicLoanFund.requestLoan('1000000000000000000', [ secretHashA1_1, secretHashA2_1 ], 604800, { from: borrower1 }))
//   //   })

//   //   it('should fail if loanDuration is greater than maxLoanDuration', async function() {
//   //     await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender });
//   //     await shouldFail.reverting(this.autoAtomicLoanFund.requestLoan('500000000000000000', [ secretHashA1_1, secretHashA2_1 ], 2419200, { from: borrower1 }))
//   //   })

//   //   it('should fail if loanDuration is less than minLoanDuration', async function() {
//   //     await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender });
//   //     await shouldFail.reverting(this.autoAtomicLoanFund.requestLoan('500000000000000000', [ secretHashA1_1, secretHashA2_1 ], 86399, { from: borrower1 }))
//   //   })
//   // })

//   // describe('widthdraw', function() {
//   //   it('should succeed if msg.sender is the lender', async function() {
//   //     await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender })
//   //     assert.equal((await this.token.balanceOf(this.autoAtomicLoanFund.address)),'1000000000000000000')
//   //     await this.autoAtomicLoanFund.withdraw('1000000000000000000', { from: lender })
//   //     assert.equal((await this.token.balanceOf(this.autoAtomicLoanFund.address)),'0')
//   //   })

//   //   it('should fail if msg.sender is not lender', async function() {
//   //     await this.autoAtomicLoanFund.fund('1000000000000000000', { from: lender })
//   //     assert.equal((await this.token.balanceOf(this.autoAtomicLoanFund.address)),'1000000000000000000')
//   //     await shouldFail.reverting(this.autoAtomicLoanFund.withdraw('1000000000000000000', { from: borrower1 }))
//   //   })
//   // })
// });
