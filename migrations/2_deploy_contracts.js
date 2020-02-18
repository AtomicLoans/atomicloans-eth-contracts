const { toWei, padLeft, numberToHex } = web3.utils;

var ExampleDaiCoin = artifacts.require("./ExampleDaiCoin.sol");
var ExampleUsdcCoin = artifacts.require("./ExampleUsdcCoin.sol");
var ExamplePausableDaiCoin = artifacts.require("./ExamplePausableDaiCoin.sol")
var Medianizer = artifacts.require('./MedianizerExample.sol');
var ISPVRequestManager = artifacts.require('./ISPVRequestManager.sol');
var Funds = artifacts.require('./Funds.sol');
var Loans = artifacts.require('./Loans.sol');
var Sales = artifacts.require('./Sales.sol');
var P2WSH = artifacts.require('./P2WSH.sol');
var Collateral = artifacts.require('./Collateral.sol');

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

var fs = require('fs')

var isCI = require('is-ci')

if (isCI) {
  console.info = () => {} // Silence the Deprecation Warning
}

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    // Deploy Example DAI
    await deployer.deploy(ExampleDaiCoin); // LOCAL
    var dai = await ExampleDaiCoin.deployed(); // LOCAL
    // const dai = { address: '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa' } // KOVAN - Compound DAI Contract
    // const dai = { address: '0x6b175474e89094c44da98b954eedeac495271d0f' } // MAINNET

    // Deploy Example USDC
    await deployer.deploy(ExampleUsdcCoin);
    var usdc = await ExampleUsdcCoin.deployed();
    // const usdc = { address: '0x75b0622cec14130172eae9cf166b92e5c112faff' } // KOVAN - Compound USDC Contract
    // const usdc = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' } // MAINNET

    // Deploy Example DAI Pausable
    await deployer.deploy(ExamplePausableDaiCoin); // LOCAL
    var pausableDai = await ExamplePausableDaiCoin.deployed(); // LOCAL

    await deployer.deploy(MakerMedianizer) // LOCAL
    var makerMedianizer = await MakerMedianizer.deployed(); // LOCAL
    await makerMedianizer.poke(padLeft(numberToHex(toWei('200', 'ether')), 64)) // LOCAL
    // const makerMedianizer = { address: '0xA944bd4b25C9F186A846fd5668941AA3d3B8425F' } // KOVAN
    // const makerMedianizer = { address: '0x729D19f657BD0614b4985Cf1D82531c67569197B' } // MAINNET

    // Deploy cDAI
    await deployer.deploy(DAIInterestRateModel, toWei('0.05', 'ether'), toWei('0.12', 'ether'))
    await deployer.deploy(USDCInterestRateModel, toWei('0', 'ether'), toWei('0.2', 'ether'))
    await deployer.deploy(DAIInterestRateModel, toWei('0.05', 'ether'), toWei('0.12', 'ether'))
    await deployer.deploy(ETHInterestRateModel, toWei('0', 'ether'), toWei('0.2', 'ether'))
    var daiInterestRateModel = await DAIInterestRateModel.deployed()
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

    await deployer.deploy(CErc20, dai.address, comptroller.address, daiInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Dai', 'cDAI', '8')
    var cdai = await CErc20.deployed()

    var cusdc = await CErc20.new(usdc.address, comptroller.address, usdcInterestRateModel.address, toWei('0.2', 'finney'), 'Compound Usdc', 'cUSDC', '8')

    await deployer.deploy(CEther, comptroller.address, ethInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Ether', 'cETH', '8')
    var ceth = await CEther.deployed()

    await comptroller._supportMarket(cdai.address)
    await comptroller._supportMarket(cusdc.address)
    await comptroller._supportMarket(cdai.address)
    await comptroller._supportMarket(ceth.address)

    await deployer.deploy(PriceOracle, accounts[0], dai.address, makerMedianizer.address, usdc.address, makerMedianizer.address)
    var priceOracle = await PriceOracle.deployed()

    await deployer.deploy(PriceOracleProxy, comptroller.address, priceOracle.address, ceth.address)
    var priceOracleProxy = await PriceOracleProxy.deployed()

    await priceOracle.setPrices([padLeft(numberToHex(1), 40)], [toWei('0.0049911026', 'ether')])
    await priceOracle.setPrices([padLeft(numberToHex(2), 40)], [toWei('0.0049911026', 'ether')])

    await comptroller._setPriceOracle(priceOracleProxy.address)
    await comptroller._setCollateralFactor(ceth.address, toWei('0.75', 'ether'))

    await comptroller.enterMarkets([cdai.address, cusdc.address, ceth.address])

    await dai.approve(cdai.address, toWei('100', 'ether'))
    await cdai.mint(toWei('100', 'ether'))

    await usdc.approve(cusdc.address, toWei('100', 'mwei'))
    await cusdc.mint(toWei('100', 'mwei'))

    // Deploy example Medianizer
    await deployer.deploy(Medianizer);
    var medianizer = await Medianizer.deployed();
    await medianizer.poke(padLeft(numberToHex(toWei('8000', 'ether')), 64))

    await deployer.deploy(ISPVRequestManager);
    var onDemandSpv = await ISPVRequestManager.deployed();
    // LOCAL

    // const cdai = { address: '0xe7bc397dbd069fc7d0109c0636d06888bb50668c' } // KOVAN
    // const cdai = { address: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643' } // MAINNET

    // const cusdc = { address: '0xcfc9bb230f00bffdb560fce2428b4e05f3442e35' } // KOVAN
    // const cusdc = { address: '0x39aa39c021dfbae8fac545936693ac917d5e7563' } // MAINNET

    // const comptroller = { address: '0x142d11cb90a2b40f7d0c55ed1804988dfc316fae' } // KOVAN
    // const comptroller = { address: '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b' } // MAINNET

    // const medianizer = { address: '0x87c26fd61500fCf86dBe5DCD6E2DEcEDE70d4f82' } // KOVAN
    // const medianizer = { address: '0x8b262e17C7D1C210FC9B6D8B26498F0f4f530776' } // KOVAN MEDIANIZER EXAMPLE
    // const medianizer = { address: '0x10d2f250A30Dc78f3B418730E6AAE4c1Cf695889' } // MAINNET

    // const onDemandSpv = { address: '0x7c7ca88944a6cb439c0dc43c6406f00feb1e17b0' } // KOVAN

    // // Deploy Atomic Loan Contracts
    await deployer.deploy(Funds, dai.address, '18');
    var funds = await Funds.deployed();
    await funds.setCompound(cdai.address, comptroller.address);
    await deployer.deploy(Loans, funds.address, medianizer.address, dai.address, '18');
    var loans = await Loans.deployed();
    await deployer.deploy(Sales, loans.address, funds.address, medianizer.address, dai.address);
    var sales = await Sales.deployed();
    await funds.setLoans(loans.address);
    await loans.setSales(sales.address);
    await deployer.deploy(P2WSH, loans.address);
    var p2wsh = await P2WSH.deployed();
    await deployer.deploy(Collateral, loans.address);
    var collateral = await Collateral.deployed();
    await collateral.setOnDemandSpv(onDemandSpv.address);
    await collateral.setP2WSH(p2wsh.address);
    await loans.setCollateral(collateral.address);

    const usdcFunds = await Funds.new(usdc.address, '6')
    await usdcFunds.setCompound(cusdc.address, comptroller.address)
    const usdcLoans = await Loans.new(usdcFunds.address, medianizer.address, usdc.address, '6')
    const usdcSales = await Sales.new(usdcLoans.address, usdcFunds.address, medianizer.address, usdc.address)
    await usdcFunds.setLoans(usdcLoans.address)
    await usdcLoans.setSales(usdcSales.address)
    const usdcP2WSH = await P2WSH.new(usdcLoans.address)
    const usdcCollateral = await Collateral.new(usdcLoans.address)
    await usdcCollateral.setOnDemandSpv(onDemandSpv.address);
    await usdcCollateral.setP2WSH(usdcP2WSH.address)
    await usdcLoans.setCollateral(usdcCollateral.address)

    await deployer.deploy(ALCompound, comptroller.address) // LOCAL

    console.info(`DAI_ADDRESS=${dai.address}`)
    console.info(`USDC_ADDRESS=${usdc.address}`)

    console.info(`CDAI_ADDRESS=${cdai.address}`)
    console.info(`CUSDC_ADDRESS=${cusdc.address}`)

    console.info(`DAI_LOAN_FUNDS_ADDRESS=${funds.address}`)
    console.info(`DAI_LOAN_LOANS_ADDRESS=${loans.address}`)
    console.info(`DAI_LOAN_SALES_ADDRESS=${sales.address}`)

    console.info(`USDC_LOAN_FUNDS_ADDRESS=${usdcFunds.address}`)
    console.info(`USDC_LOAN_LOANS_ADDRESS=${usdcLoans.address}`)
    console.info(`USDC_LOAN_SALES_ADDRESS=${usdcSales.address}`)

    console.info('==================================')

    console.info('{')
    console.info(`  "DAI": "${dai.address}",`)
    console.info(`  "USDC": "${usdc.address}",`)
    console.info(`  "CDAI": "${cdai.address}",`)
    console.info(`  "CUSDC": "${cusdc.address}",`)
    console.info(`  "DAI_FUNDS": "${funds.address}",`)
    console.info(`  "DAI_LOANS": "${loans.address}",`)
    console.info(`  "DAI_SALES": "${sales.address}",`)
    console.info(`  "USDC_FUNDS": "${usdcFunds.address}",`)
    console.info(`  "USDC_LOANS": "${usdcLoans.address}",`)
    console.info(`  "USDC_SALES": "${usdcSales.address}",`)
    console.info(`  "MEDIANIZER": "${medianizer.address}",`)
    console.info(`  "ONDEMANDSPV": "${onDemandSpv.address}"`)
    console.info('}')

    const contractAddresses = {
        "DAI": dai.address,
        "USDC": usdc.address,
        "CDAI": cdai.address,
        "CUSDC": cusdc.address,
        "DAI_FUNDS": funds.address,
        "DAI_LOANS": loans.address,
        "DAI_SALES": sales.address,
        "USDC_FUNDS": usdcFunds.address,
        "USDC_LOANS": usdcLoans.address,
        "USDC_SALES": usdcSales.address,
        "MEDIANIZER": medianizer.address,
        "ONDEMANDSPV": onDemandSpv.address
    }

    fs.writeFile('addresses.json', JSON.stringify(contractAddresses, null,'\t'))
  })
};
