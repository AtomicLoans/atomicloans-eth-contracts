const Bytes = artifacts.require("./P2WSH.sol");

beforeEach(async function () {
  const bytes = await Bytes.deployed();

  this.bytes = bytes
})

describe('scriptNumSize', function() {
  it('should return 5 if value is greater than 0x7fffffff', async function() {
    const i = parseInt('0x7fffffff') + 1

    const scriptNumSize = await this.bytes.scriptNumSize.call(i)

    expect(parseInt(scriptNumSize)).to.equal(5)
  })

  it('should return 4 if value is greater than 0x7fffff', async function() {
    const i = parseInt('0x7fffff') + 1

    const scriptNumSize = await this.bytes.scriptNumSize.call(i)

    expect(parseInt(scriptNumSize)).to.equal(4)
  })

  it('should return 3 if value is greater than 0x7fff', async function() {
    const i = parseInt('0x7fff') + 1

    const scriptNumSize = await this.bytes.scriptNumSize.call(i)

    expect(parseInt(scriptNumSize)).to.equal(3)
  })

  it('should return 2 if value is greater than 0x7f', async function() {
    const i = parseInt('0x7f') + 1

    const scriptNumSize = await this.bytes.scriptNumSize.call(i)

    expect(parseInt(scriptNumSize)).to.equal(2)
  })

  it('should return 1 if value is greater than 0x00', async function() {
    const i = parseInt('0x00') + 1

    const scriptNumSize = await this.bytes.scriptNumSize.call(i)

    expect(parseInt(scriptNumSize)).to.equal(1)
  })

  it('should return 0 if value is 0x00', async function() {
    const i = parseInt('0x00')

    const scriptNumSize = await this.bytes.scriptNumSize.call(i)

    expect(parseInt(scriptNumSize)).to.equal(0)
  })
})
