const { toWei, fromWei, padLeft, numberToHex } = web3.utils;

const toSecs = require('@mblackmblack/to-seconds');
const BN = require('bignumber.js')

var ExampleDaiCoin = artifacts.require("./ExampleDaiCoin.sol");
var ExampleSaiCoin = artifacts.require("./ExampleSaiCoin.sol");
var ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
var ExamplePausableSaiCoin = artifacts.require("./ExamplePausableSaiCoin.sol")
var Medianizer = artifacts.require('./MedianizerExample.sol');
var ISPVRequestManager = artifacts.require('./ISPVRequestManager.sol');
var Funds = artifacts.require('./Funds.sol');
var Loans = artifacts.require('./Loans.sol');
var Sales = artifacts.require('./Sales.sol');
var P2WSH = artifacts.require('./P2WSH.sol');
var Bytes = artifacts.require('./Bytes.sol');

var SAIInterestRateModel = artifacts.require('./SAIInterestRateModel.sol')
var USDCInterestRateModel = artifacts.require('./USDCInterestRateModel.sol')
var DAIInterestRateModel = artifacts.require('./DAIInterestRateModel.sol')
var ETHInterestRateModel = artifacts.require('./ETHInterestRateModel.sol')
var Unitroller = artifacts.require('./Unitroller.sol')
var Comptroller = artifacts.require('./Comptroller.sol')
var CErc20 = artifacts.require('./CErc20.sol')
var CEther = artifacts.require('./CEther.sol')
var PriceOracleProxy = artifacts.require('./PriceOracleProxy.sol')
var PriceOracle = artifacts.require('./_PriceOracle.sol')
var MakerMedianizer = artifacts.require('./_MakerMedianizer.sol')

var ALCompound = artifacts.require('./ALCompound.sol')

var isCI = require('is-ci')

if (isCI) {
  console.info = () => {} // Silence the Deprecation Warning
}

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    // Deploy Example SAI
    await deployer.deploy(ExampleSaiCoin); // LOCAL
    var sai = await ExampleSaiCoin.deployed(); // LOCAL
    // const sai = { address: '0xc4375b7de8af5a38a93548eb8453a498222c4ff2' } // KOVAN - Compound SAI Contract
    // const sai = { address: '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359' } // MAINNET

    // Deploy Example USDC
    await deployer.deploy(ExampleUsdcCoin);
    var usdc = await ExampleUsdcCoin.deployed();
    // const usdc = { address: '0x6e894660985207feb7cf89faf048998c71e8ee89' } // KOVAN - Compound USDC Contract
    // const usdc = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' } // MAINNET

    // Deploy Example DAI
    await deployer.deploy(ExampleDaiCoin);
    var dai = await ExampleDaiCoin.deployed();
    // const dai = { address: '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa' } // KOVAN - Compound DAI Contract
    // const dai = { address: '0x6b175474e89094c44da98b954eedeac495271d0f' } // MAINNET

    // Deploy Example SAI Pausable
    await deployer.deploy(ExamplePausableSaiCoin); // LOCAL
    var pausableSAi = await ExamplePausableSaiCoin.deployed(); // LOCAL

    await deployer.deploy(MakerMedianizer) // LOCAL
    var makerMedianizer = await MakerMedianizer.deployed(); // LOCAL
    await makerMedianizer.poke(padLeft(numberToHex(toWei('200', 'ether')), 64)) // LOCAL
    // const makerMedianizer = { address: '0xA944bd4b25C9F186A846fd5668941AA3d3B8425F' } // KOVAN
    // const makerMedianizer = { address: '0x729D19f657BD0614b4985Cf1D82531c67569197B' } // MAINNET

    // Deploy cSAI
    await deployer.deploy(SAIInterestRateModel, toWei('0.05', 'ether'), toWei('0.12', 'ether'))
    await deployer.deploy(USDCInterestRateModel, toWei('0', 'ether'), toWei('0.2', 'ether'))
    await deployer.deploy(DAIInterestRateModel, toWei('0.05', 'ether'), toWei('0.12', 'ether'))
    await deployer.deploy(ETHInterestRateModel, toWei('0', 'ether'), toWei('0.2', 'ether'))
    var saiInterestRateModel = await SAIInterestRateModel.deployed()
    var usdcInterestRateModel = await USDCInterestRateModel.deployed()
    var daiInterestRateModel = await DAIInterestRateModel.deployed()
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

    var cdai = await CErc20.new(dai.address, comptroller.address, daiInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Dai', 'cDAI', '8')

    await deployer.deploy(CEther, comptroller.address, ethInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Ether', 'cETH', '8')
    var ceth = await CEther.deployed()

    await comptroller._supportMarket(csai.address)
    await comptroller._supportMarket(cusdc.address)
    await comptroller._supportMarket(cdai.address)
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

    await dai.approve(cdai.address, toWei('100', 'ether'))
    await cdai.mint(toWei('100', 'ether'))

    // Deploy example Medianizer
    await deployer.deploy(Medianizer);
    var medianizer = await Medianizer.deployed();

    await deployer.deploy(ISPVRequestManager);
    var onDemandSpv = await ISPVRequestManager.deployed();
    // LOCAL

    // const csai = { address: '0x63c344bf8651222346dd870be254d4347c9359f7' } // KOVAN
    // const csai = { address: '0xf5dce57282a584d2746faf1593d3121fcac444dc' } // MAINNET

    // const cusdc = { address: '0xdff375162cfe7d77473c1bec4560dede974e138c' } // KOVAN
    // const cusdc = { address: '0x39aa39c021dfbae8fac545936693ac917d5e7563' } // MAINNET

    // const cdai = { address: '0xe7bc397dbd069fc7d0109c0636d06888bb50668c' } // KOVAN
    // const cdai = { address: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643' } // MAINNET

    // const comptroller = { address: '0x142d11cb90a2b40f7d0c55ed1804988dfc316fae' } // KOVAN
    // const comptroller = { address: '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b' } // MAINNET

    // const medianizer = { address: '0x87c26fd61500fCf86dBe5DCD6E2DEcEDE70d4f82' } // KOVAN
    // const medianizer = { address: '0x10d2f250A30Dc78f3B418730E6AAE4c1Cf695889' } // MAINNET

    // const onDemandSpv = { address: '0x7c7ca88944a6cb439c0dc43c6406f00feb1e17b0' } // KOVAN

    // // Deploy Atomic Loan Contracts
    await deployer.deploy(Funds, sai.address, '18');
    var funds = await Funds.deployed();
    await funds.setCompound(csai.address, comptroller.address);
    await deployer.deploy(Loans, funds.address, medianizer.address, sai.address, '18');
    var loans = await Loans.deployed();
    await deployer.deploy(Sales, loans.address, funds.address, medianizer.address, sai.address);
    var sales = await Sales.deployed();
    await funds.setLoans(loans.address);
    await loans.setSales(sales.address);
    await loans.setOnDemandSpv(onDemandSpv.address);
    await deployer.deploy(P2WSH, loans.address);
    var p2wsh = await P2WSH.deployed();
    await loans.setP2WSH(p2wsh.address);

    const usdcFunds = await Funds.new(usdc.address, '6')
    await usdcFunds.setCompound(cusdc.address, comptroller.address)
    const usdcLoans = await Loans.new(usdcFunds.address, medianizer.address, usdc.address, '6')
    const usdcSales = await Sales.new(usdcLoans.address, usdcFunds.address, medianizer.address, usdc.address)
    await usdcFunds.setLoans(usdcLoans.address)
    await usdcLoans.setSales(usdcSales.address)
    await usdcLoans.setOnDemandSpv(onDemandSpv.address);
    const usdcP2WSH = await P2WSH.new(usdcLoans.address)
    await usdcLoans.setP2WSH(usdcP2WSH.address)

    const daiFunds = await Funds.new(dai.address, '18')
    await daiFunds.setCompound(dai.address, comptroller.address)
    const daiLoans = await Loans.new(daiFunds.address, medianizer.address, dai.address, '18')
    const daiSales = await Sales.new(daiLoans.address, daiFunds.address, medianizer.address, dai.address)
    await daiFunds.setLoans(daiLoans.address)
    await daiLoans.setSales(daiSales.address)
    await daiLoans.setOnDemandSpv(onDemandSpv.address);
    const daiP2WSH = await P2WSH.new(daiLoans.address)
    await daiLoans.setP2WSH(daiP2WSH.address)

    await deployer.deploy(ALCompound, comptroller.address) // LOCAL

    console.info(`SAI_ADDRESS=${sai.address}`)
    console.info(`USDC_ADDRESS=${usdc.address}`)
    console.info(`DAI_ADDRESS=${dai.address}`)

    console.info(`CSAI_ADDRESS=${csai.address}`)
    console.info(`CUSDC_ADDRESS=${cusdc.address}`)
    console.info(`CDAI_ADDRESS=${cdai.address}`)

    console.info(`SAI_LOAN_FUNDS_ADDRESS=${funds.address}`)
    console.info(`SAI_LOAN_LOANS_ADDRESS=${loans.address}`)
    console.info(`SAI_LOAN_SALES_ADDRESS=${sales.address}`)

    console.info(`USDC_LOAN_FUNDS_ADDRESS=${usdcFunds.address}`)
    console.info(`USDC_LOAN_LOANS_ADDRESS=${usdcLoans.address}`)
    console.info(`USDC_LOAN_SALES_ADDRESS=${usdcSales.address}`)

    console.info(`DAI_LOAN_FUNDS_ADDRESS=${daiFunds.address}`)
    console.info(`DAI_LOAN_LOANS_ADDRESS=${daiLoans.address}`)
    console.info(`DAI_LOAN_SALES_ADDRESS=${daiSales.address}`)

    console.info('==================================')

    console.info('{')
    console.info(`  "SAI": "${sai.address}",`)
    console.info(`  "USDC": "${usdc.address}",`)
    console.info(`  "DAI": "${dai.address}",`)
    console.info(`  "CSAI": "${csai.address}",`)
    console.info(`  "CUSDC": "${cusdc.address}",`)
    console.info(`  "CDAI": "${cdai.address}",`)
    console.info(`  "SAI_FUNDS": "${funds.address}",`)
    console.info(`  "SAI_LOANS": "${loans.address}",`)
    console.info(`  "SAI_SALES": "${sales.address}",`)
    console.info(`  "USDC_FUNDS": "${usdcFunds.address}",`)
    console.info(`  "USDC_LOANS": "${usdcLoans.address}",`)
    console.info(`  "USDC_SALES": "${usdcSales.address}",`)
    console.info(`  "DAI_FUNDS": "${daiFunds.address}",`)
    console.info(`  "DAI_LOANS": "${daiLoans.address}",`)
    console.info(`  "DAI_SALES": "${daiSales.address}",`)
    console.info(`  "MEDIANIZER": "${medianizer.address}"`)
    console.info('}')
  })
};
