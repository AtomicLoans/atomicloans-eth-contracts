pragma solidity ^0.4.24;
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract ExampleCoin is StandardToken {
  string public name = "ExampleCoin"; 
  string public symbol = "EXC";
  uint public decimals = 18;
  uint public INITIAL_SUPPLY = 12010000000000000000;

  constructor () {
    uint totalSupply = INITIAL_SUPPLY;
    balances[msg.sender] = INITIAL_SUPPLY;
  }
}