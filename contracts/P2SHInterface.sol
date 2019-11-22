pragma solidity ^0.5.10;

interface P2SHInterface {
  function getP2SH(bytes32 loan, bool sez) external view returns (bytes memory, bytes32);
}
