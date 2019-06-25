const Decimal = require('decimal.js');
const { numberToHex, padLeft } = web3.utils;

Decimal.set({ precision: 28, rounding: 8 })

function isException(error) {
    let strError = error.toString();
    return strError.includes('invalid opcode') || strError.includes('invalid JUMP') || strError.includes('out of gas') || strError.includes('revert');
}

function ensureException(error) {
    assert(isException(error), error.toString());
}

function rateToSec(apr) { // Convert interest rate to rate per second (i.e. 16.5%)
  const decRate = Decimal(apr).dividedBy(100).plus(1)
  return Decimal(10).toPower(Decimal.log(decRate).dividedBy(60 * 60 * 24 * 365)).toString()
}

function numToBytes32(num) {
  return padLeft(numberToHex(num), 64)
}

module.exports = {
    zeroAddress: '0x0000000000000000000000000000000000000000',
    isException,
    ensureException,
    rateToSec,
    numToBytes32
};
