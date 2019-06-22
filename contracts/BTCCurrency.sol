import './DSMath.sol';

pragma solidity ^0.5.8;

contract BTCCurrency is DSMath {
	uint256 constant public COL = 10**8;

	string public name = "BTC"; 

	bytes4 public ccoin; // Collateral Coin Number based on BIP 44

	function cmul(uint x, uint y) public pure returns (uint z) {
        z = add(mul(x, y), COL / 2) / COL;
    }

	function cdiv(uint x, uint y) public pure returns (uint z) {
        z = add(mul(x, COL), y / 2) / y;
    }
}
