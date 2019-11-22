const { toWei, fromWei, padLeft, numberToHex } = web3.utils;

const toSecs = require('@mblackmblack/to-seconds');
const BN = require('bignumber.js')

var ExampleDaiCoin = artifacts.require("./ExampleDaiCoin.sol");
var ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
var Medianizer = artifacts.require('./MedianizerExample.sol');
var Funds = artifacts.require('./Funds.sol');
var Loans = artifacts.require('./Loans.sol');
var Sales = artifacts.require('./Sales.sol');
var P2SH  = artifacts.require('./P2SH.sol');

var SAIInterestRateModel = artifacts.require('./SAIInterestRateModel.sol')
var USDCInterestRateModel = artifacts.require('./USDCInterestRateModel.sol')
var ETHInterestRateModel = artifacts.require('./ETHInterestRateModel.sol')
var Unitroller = artifacts.require('./Unitroller.sol')
var Comptroller = artifacts.require('./Comptroller.sol')
var CErc20 = artifacts.require('./CErc20.sol')
var CEther = artifacts.require('./CEther.sol')
var PriceOracleProxy = artifacts.require('./PriceOracleProxy.sol')
var PriceOracle = artifacts.require('./_PriceOracle.sol')
var MakerMedianizer = artifacts.require('./_MakerMedianizer.sol')

var ALCompound = artifacts.require('./ALCompound.sol')

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    // Deploy Example SAI
    await deployer.deploy(ExampleDaiCoin); // LOCAL
    var sai = await ExampleDaiCoin.deployed(); // LOCAL
    // const sai = { address: '0xbf7a7169562078c96f0ec1a8afd6ae50f12e5a99' } // KOVAN - Compound SAI Contract
    // const sai = { address: '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359' } // MAINNET

    // Deploy Example USDC
    await deployer.deploy(ExampleUsdcCoin);
    var usdc = await ExampleUsdcCoin.deployed();
    // const usdc = { address: '0x6e894660985207feb7cf89faf048998c71e8ee89' } // KOVAN - Compound USDC Contract
    // const usdc = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' } // MAINNET

    await deployer.deploy(MakerMedianizer) // LOCAL
    var makerMedianizer = await MakerMedianizer.deployed(); // LOCAL
    await makerMedianizer.poke(padLeft(numberToHex(toWei('200', 'ether')), 64)) // LOCAL
    // const makerMedianizer = { address: '0xA944bd4b25C9F186A846fd5668941AA3d3B8425F' } // KOVAN
    // const makerMedianizer = { address: '0x729D19f657BD0614b4985Cf1D82531c67569197B' } // MAINNET

    // Deploy cSAI
    await deployer.deploy(SAIInterestRateModel, toWei('0.05', 'ether'), toWei('0.12', 'ether'))
    await deployer.deploy(USDCInterestRateModel, toWei('0', 'ether'), toWei('0.2', 'ether'))
    await deployer.deploy(ETHInterestRateModel, toWei('0', 'ether'), toWei('0.2', 'ether'))
    var saiInterestRateModel = await SAIInterestRateModel.deployed()
    var usdcInterestRateModel = await USDCInterestRateModel.deployed()
    var ethInterestRateModel = await ETHInterestRateModel.deployed()

    await deployer.deploy(Unitroller)
    var unitroller = await Unitroller.deployed()

    await deployer.deploy(Comptroller)
    var comptroller = await Comptroller.deployed()

    await unitroller._setPendingImplementation(comptroller.address)
    await unitroller._acceptImplementation()
    await comptroller._setLiquidationIncentive(toWei('1.05', 'ether'))
    await comptroller._setMaxAssets(10)

    await deployer.deploy(CErc20, sai.address, comptroller.address, saiInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Dai', 'cSAI', '8')
    var csai = await CErc20.deployed()

    var cusdc = await CErc20.new(usdc.address, comptroller.address, usdcInterestRateModel.address, toWei('0.2', 'finney'), 'Compound Usdc', 'cUSDC', '8')

    await deployer.deploy(CEther, comptroller.address, ethInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Ether', 'cETH', '8')
    var ceth = await CEther.deployed()

    await comptroller._supportMarket(csai.address)
    await comptroller._supportMarket(cusdc.address)
    await comptroller._supportMarket(ceth.address)

    await deployer.deploy(PriceOracle, accounts[0], sai.address, makerMedianizer.address, usdc.address, makerMedianizer.address)
    var priceOracle = await PriceOracle.deployed()

    await deployer.deploy(PriceOracleProxy, comptroller.address, priceOracle.address, ceth.address)
    var priceOracleProxy = await PriceOracleProxy.deployed()

    await priceOracle.setPrices([padLeft(numberToHex(1), 40)], [toWei('0.0049911026', 'ether')])
    await priceOracle.setPrices([padLeft(numberToHex(2), 40)], [toWei('0.0049911026', 'ether')])

    await comptroller._setPriceOracle(priceOracleProxy.address)
    await comptroller._setCollateralFactor(ceth.address, toWei('0.75', 'ether'))

    await comptroller.enterMarkets([csai.address, cusdc.address, ceth.address])

    await sai.approve(csai.address, toWei('100', 'ether'))
    await csai.mint(toWei('100', 'ether'))

    await usdc.approve(cusdc.address, toWei('100', 'mwei'))
    await cusdc.mint(toWei('100', 'mwei'))

    // Deploy example Medianizer
    await deployer.deploy(Medianizer);
    var medianizer = await Medianizer.deployed();
    // LOCAL

    // const csai = { address: '0x0a1e4d0b5c71b955c0a5993023fc48ba6e380496' } // KOVAN
    // const csai = { address: '0xf5dce57282a584d2746faf1593d3121fcac444dc' } // MAINNET

    // const cusdc = { address: '0xdff375162cfe7d77473c1bec4560dede974e138c' } // KOVAN
    // const cusdc = { address: '0x39aa39c021dfbae8fac545936693ac917d5e7563' } // MAINNET

    // const comptroller = { address: '0x142d11cb90a2b40f7d0c55ed1804988dfc316fae' } // KOVAN
    // const comptroller = { address: '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b' } // MAINNET

    // const medianizer = { address: '0x87c26fd61500fCf86dBe5DCD6E2DEcEDE70d4f82' } // KOVAN
    // const medianizer = { address: '0x10d2f250A30Dc78f3B418730E6AAE4c1Cf695889' } // MAINNET

    // // Deploy Atomic Loan Contracts
    await deployer.deploy(Funds, sai.address, '18');
    var funds = await Funds.deployed();
    await funds.setCompound(csai.address, comptroller.address);
    await deployer.deploy(Loans, funds.address, medianizer.address, sai.address, '18');
    var loans = await Loans.deployed();
    await deployer.deploy(Sales, loans.address, medianizer.address, sai.address);
    var sales = await Sales.deployed();
    await funds.setLoans(loans.address);
    await loans.setSales(sales.address);
    await deployer.deploy(P2SH, loans.address);
    var p2sh = await P2SH.deployed();
    await loans.setP2SH(p2sh.address);
    await loans.setOnDemandSpv(accounts[9]);

    const usdcFunds = await Funds.new(usdc.address, '6')
    await usdcFunds.setCompound(cusdc.address, comptroller.address)
    const usdcLoans = await Loans.new(usdcFunds.address, medianizer.address, usdc.address, '6')
    const usdcSales = await Sales.new(usdcLoans.address, medianizer.address, usdc.address)

    await usdcFunds.setLoans(usdcLoans.address)
    await usdcLoans.setSales(usdcSales.address)

    await deployer.deploy(ALCompound, comptroller.address) // LOCAL

    console.log(`SAI_ADDRESS=${sai.address}`)
    console.log(`USDC_ADDRESS=${usdc.address}`)

    console.log(`CSAI_ADDRESS=${csai.address}`)
    console.log(`CUSDC_ADDRESS=${cusdc.address}`)

    console.log(`SAI_LOAN_FUNDS_ADDRESS=${funds.address}`)
    console.log(`SAI_LOAN_LOANS_ADDRESS=${loans.address}`)
    console.log(`SAI_LOAN_SALES_ADDRESS=${sales.address}`)

    console.log(`USDC_LOAN_FUNDS_ADDRESS=${usdcFunds.address}`)
    console.log(`USDC_LOAN_LOANS_ADDRESS=${usdcLoans.address}`)
    console.log(`USDC_LOAN_SALES_ADDRESS=${usdcSales.address}`)

    console.log('==================================')

    console.log('{')
    console.log(`  "SAI": "${sai.address}",`)
    console.log(`  "USDC": "${usdc.address}",`)
    console.log(`  "CSAI": "${csai.address}",`)
    console.log(`  "CUSDC": "${cusdc.address}",`)
    console.log(`  "SAI_FUNDS": "${funds.address}",`)
    console.log(`  "SAI_LOANS": "${loans.address}",`)
    console.log(`  "SAI_SALES": "${sales.address}",`)
    console.log(`  "USDC_FUNDS": "${usdcFunds.address}",`)
    console.log(`  "USDC_LOANS": "${usdcLoans.address}",`)
    console.log(`  "USDC_SALES": "${usdcSales.address}",`)
    console.log(`  "MEDIANIZER": "${medianizer.address}"`)
    console.log('}')
  })
};
