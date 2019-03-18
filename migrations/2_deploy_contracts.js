var ExampleCoin = artifacts.require("./ExampleCoin.sol");

module.exports = function(deployer) {
  deployer.deploy(ExampleCoin);
};
