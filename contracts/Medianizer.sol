import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';

pragma solidity ^0.5.8;

contract Medianizer {
    function peek() public returns (bytes32, bool);
    function read() public returns (bytes32);
    function poke(bytes32 wut) public;
    function void() public;
    function push(uint256 amt, ERC20 tok) public;
}
