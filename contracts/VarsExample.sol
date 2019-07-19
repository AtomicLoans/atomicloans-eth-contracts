pragma solidity ^0.5.8;

contract VarsExample {
    uint256 public constant APEXT = 7200;                         // approval expiration threshold
    uint256 public constant ACEXT = 172800;                       // acceptance expiration threshold
    uint256 public constant BIEXT = 604800;                       // bidding expirataion threshold
    uint256 public constant SIEXT = 172800;                       // seizure expiration threshold
    uint256 public constant SALEX = 3600;                         // Sales Expiration
    uint256 public constant SETEX = 14400;                        // Settlement Expiration
    uint256 public constant MINBI = 1005000000000000000000000000; // Minimum Bid Increment in RAY
}