var ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
var Medianizer = artifacts.require('./MedianizerExample.sol');
var Funds = artifacts.require('./Funds.sol');
var Loans = artifacts.require('./Loans.sol');
var Sales = artifacts.require('./Sales.sol');

module.exports = function(deployer) {
  deployer.then(async () => {
    await deployer.deploy(ExampleCoin);
    var token = await ExampleCoin.deployed();
    await deployer.deploy(Medianizer);
    var medianizer = await Medianizer.deployed();
    await deployer.deploy(Funds, token.address);
    var funds = await Funds.deployed();
    await deployer.deploy(Loans, funds.address, medianizer.address, token.address);
    var loans = await Loans.deployed();
    await deployer.deploy(Sales, loans.address, medianizer.address, token.address);
    var sales = await Sales.deployed();
    await funds.setLoans(loans.address);
    await loans.setSales(sales.address);
  })
};
