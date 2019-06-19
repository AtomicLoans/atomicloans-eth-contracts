import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './DSMath.sol';

pragma solidity ^0.5.8;

contract Funds {
    using SafeMath for uint256;

    Loans loans;

    mapping (address => bytes32[]) public sechs; // User secret hashes
    mapping (address => uint256)   public sechi; // User secret hash index

    mapping (address => bytes)     public pubks;  // User A Coin PubKeys
    
    mapping (bytes32 => Fund)      public funds;
    uint256                        public fundi;

    mapping (address => bool)      public tokas;  // Is ERC20 Token Approved

    struct Fund {
        address  own;   // Loan Fund Owner (Lender)
        uint256  mila;  // Min Loan Amount
        uint256  mala;  // Max Loan Amount
        uint256  mild;  // Min Loan Duration
        uint256  mald;  // Max Loan Duration
        uint256  rate;  // Interest Rate
        uint256  pen;   // Liquidation Penalty Rate
        uint256  fee;   // Optional Automation Fee
        uint256  rat;   // Liquidation Ratio
        uint256  amt;   // Locked amount in fund (in TOK)
        address  agent; // Optional Automator Agent
        ERC20    tok;   // Debt Token
    }

    constructor (
        address med // Medianizer Contract Address
    ) public {
        loans = new Loans(address(this), med);
    }

    function own(bytes32 fund) public view returns (address) {
        return funds[fund].own;
    }

    function open(
        uint256 mila_,  // Min Loan Amount
        uint256 mala_,  // Max Loan Amount
        uint256 mild_,  // Min Loan Duration
        uint256 mald_,  // Max Loan Duration
        uint256 rat_,   // Liquidation Ratio (to 6 decimal places)
        uint256 rate_,  // Hourly Interest Rate to ten decimal places (i.e. 0.000799086758% would be inputed as 7990868)
        uint256 pen_,   // Liquidation Penalty Rate
        uint256 fee_,   // Optional Automation Fee Rate
        address agent_, // Optional Address Automated Agent
        ERC20   tok_,   // Debt Token
        bytes4  ccoin_  // Collateral Coin Number based on BIP 44
    ) public returns (bytes32 fund) {
        fundi = fundi.add(1);
        fund = bytes32(fundi);
        funds[fund].own   = msg.sender; // Loan Fund Owner (Lender)
        funds[fund].mila  = mila_;      // Min Loan Amount
        funds[fund].mala  = mala_;      // Max Loan Amount
        funds[fund].mild  = mild_;      // Min Loan Duration
        funds[fund].mald  = mald_;      // Max Loan Duration
        funds[fund].rate  = rate_;
        funds[fund].pen   = pen_;
        funds[fund].fee   = fee_;
        funds[fund].rat   = rat_;
        funds[fund].tok   = tok_;
        funds[fund].agent = agent_;

        if (tokas[address(tok_)] == false) {
            tok_.approve(address(loans), 2**256-1);
            tokas[address(tok_)] = true;
        }
    }

    function push(bytes32 fund, uint256 amt) public {
        require(msg.sender == funds[fund].own);
        funds[fund].tok.transferFrom(msg.sender, address(this), amt);
        funds[fund].amt = funds[fund].amt.add(amt);
    }

    function gen(bytes32[] memory sechs_) public { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < sechs_.length; i++) {
            sechs[msg.sender].push(sechs_[i]);
        }
    }

    function set(bytes memory pubk) public {
        pubks[msg.sender] = pubk;
    }

    function req(
        bytes32           fund,   // Fund Index
        uint256           amt_,    // Loan Amount
        uint256           col_,    // Collateral Amount in satoshis
        bytes32[4] memory sechs_,  // Secret Hash A1 & A2
        uint256           lodu_,   // Loan Duration in seconds
        bytes      memory pubk_    // Pubkey
    ) public { // Request Loan
        require(msg.sender != funds[fund].own);
        require(amt_       >= funds[fund].mila);
        require(amt_       <= funds[fund].mala);
        require(lodu_      >= funds[fund].mild);
        require(lodu_      <= funds[fund].mald);
        require(pubks[funds[fund].own].length > 0); // Ensure Lender PubKey is set

        // bytes32 loani = loans.open(
            
        // );

        uint256 test = 0;

        // bytes32 loani = loans.open(
        //     [ sechA1, sechA2 ],
        //     [ sechs[own(fund)][sechi[own(fund)].add(1)], sechs[own(fund)][sechi[own(fund)].add(2)] ], // Secret Hash B1 & B2
        //     now + lodu_,
        //     msg.sender,
        //     own(fund),
        //     funds[fund].agent,
        //     amt_,
        //     amt_.mul(lodu_.div(3600)).mul(funds[fund].rate).div(10**12), // Loan Interest
        //     amt_.mul(lodu_.div(3600)).mul(funds[fund].pen).div(10**12),  // Loan Liquidation Penalty
        //     amt_.mul(lodu_.div(3600)).mul(funds[fund].fee).div(10**12),  // Optional Automation Fee
        //     col_,
        //     funds[fund].rat,
        //     pubk_,
        //     pubks[own(fund)],
        //     funds[fund].tok,
        //     fund
        // );
        // sechi[funds[fund].own] = sechi[own(fund)].add(2);
        // loans.push(loani, amt);
        // Request Loan Event
    }
}