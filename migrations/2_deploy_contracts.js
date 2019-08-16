const { toWei, fromWei } = web3.utils;

var ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
var Medianizer = artifacts.require('./MedianizerExample.sol');
var Funds = artifacts.require('./Funds.sol');
var Loans = artifacts.require('./Loans.sol');
var Sales = artifacts.require('./Sales.sol');

var DAIInterestRateModel = artifacts.require('./DAIInterestRateModel.sol')
var ETHInterestRateModel = artifacts.require('./ETHInterestRateModel.sol')
var Unitroller = artifacts.require('./Unitroller.sol')
var Comptroller = artifacts.require('./Comptroller.sol')
var CErc20 = artifacts.require('./CErc20.sol')
var CEther = artifacts.require('./CEther.sol')

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    // Deploy Example DAI
    await deployer.deploy(ExampleCoin);
    var token = await ExampleCoin.deployed();

    // Deploy cDAI
    await deployer.deploy(DAIInterestRateModel, toWei('0.05', 'ether'), toWei('0.12', 'ether'))
    await deployer.deploy(ETHInterestRateModel, toWei('0', 'ether'), toWei('0.2', 'ether'))
    var daiInterestRateModel = await DAIInterestRateModel.deployed()
    var ethInterestRateModel = await ETHInterestRateModel.deployed()

    await deployer.deploy(Unitroller)
    var unitroller = await Unitroller.deployed()

    await deployer.deploy(Comptroller)
    var comptroller = await Comptroller.deployed()

    await unitroller._setPendingImplementation(comptroller.address)
    await unitroller._acceptImplementation()
    await comptroller._setLiquidationIncentive(toWei('1.05', 'ether'))

    await deployer.deploy(CErc20, token.address, comptroller.address, daiInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Dai', 'cDAI', '8')
    var cdai = await CErc20.deployed()

    await deployer.deploy(CEther, comptroller.address, ethInterestRateModel.address, toWei('0.2', 'gether'), 'Compound Ether', 'cETH', '8')
    var ceth = await CEther.deployed()

    await comptroller._supportMarket(cdai.address)
    await comptroller._supportMarket(ceth.address)

    // Deploy example Medianizer
    await deployer.deploy(Medianizer);
    var medianizer = await Medianizer.deployed();

    // Deploy Atomic Loan Contracts
    await deployer.deploy(Funds, token.address, cdai.address, comptroller.address);
    var funds = await Funds.deployed();
    await deployer.deploy(Loans, funds.address, medianizer.address, token.address);
    var loans = await Loans.deployed();
    await deployer.deploy(Sales, loans.address, medianizer.address, token.address);
    var sales = await Sales.deployed();
    await funds.setLoans(loans.address);
    await loans.setSales(sales.address);
  })
};
