pragma solidity 0.5.10;

interface SpvInterface {
    function saleIndexByLoan(bytes32, uint256) external returns(bytes32);
}
