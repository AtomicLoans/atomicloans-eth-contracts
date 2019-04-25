var ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");

module.exports = function(deployer) {
  deployer.deploy(ExampleCoin);
};
