const ExampleCoin = artifacts.require("./ExampleDaiCoin.sol");
const Funds = artifacts.require("./Funds.sol");
const CErc20 = artifacts.require('./CErc20.sol');
const CEther = artifacts.require('./CEther.sol');
const Comptroller = artifacts.require('./Comptroller.sol')
const Compound = artifacts.require('./ALCompound.sol');

contract("ALCompound", accounts => {
  beforeEach(async function () {
    this.token = await ExampleCoin.deployed();
    this.cErc20 = await CErc20.deployed();
    this.cEther = await CEther.deployed();
    this.compound = await Compound.deployed();
    this.comptroller = await Comptroller.deployed();
    this.alcompound = await Funds.deployed();
  })

  describe('getComptrollerAddress', async function() {
    it('should return current comptroller address', async function() {
      const expectedComptrollerAddress = this.comptroller.address
      const actualComptrollerAddress = await this.alcompound.getComptrollerAddress.call()

      assert.equal(expectedComptrollerAddress, actualComptrollerAddress)
    })
  })
})
