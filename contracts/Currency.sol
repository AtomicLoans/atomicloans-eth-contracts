import './DSMath.sol';

pragma solidity ^0.5.8;

contract Currency {
	function COL() public returns (uint256);
	function name() public returns (string memory);
	function cmul(uint x, uint y) public pure returns (uint);
	function cdiv(uint x, uint y) public pure returns (uint);
}