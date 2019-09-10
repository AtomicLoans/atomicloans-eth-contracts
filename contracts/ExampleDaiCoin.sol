import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';

pragma solidity ^0.5.2;

contract ExampleDaiCoin is ERC20 {
  string public name = "ExampleDAICoin"; 
  string public symbol = "DAI";
  uint public decimals = 18;

  constructor () public {
    _mint(msg.sender, 22020000000000000000000);
  }

  function mintTokens () public {
    _mint(msg.sender, 10 ether);
  }
}