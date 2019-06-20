import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './DSMath.sol';

pragma solidity ^0.5.8;

contract Funds is DSMath {
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
        uint256  lint;  // Interest Rate in RAY
        uint256  lpen;  // Liquidation Penalty Rate in RAY
        uint256  lfee;  // Optional Automation Fee in RAY
        uint256  rat;   // Liquidation Ratio in RAY
        address  agent; // Optional Automator Agent
        uint256  bal;   // Locked amount in fund (in TOK)
        ERC20    tok;   // Debt Token
    }

    constructor (
        address med, // Medianizer Contract Address
        address cur  // Currency Contract Address
    ) public {
        loans = new Loans(address(this), med, cur);
    }

    function own(bytes32 fund) public view returns (address) {
        return funds[fund].own;
    }

    function mila(bytes32 fund) public view returns (uint256) {
        return funds[fund].mila;
    }

    function mala(bytes32 fund) public view returns (uint256) {
        return funds[fund].mala;
    }

    function mild(bytes32 fund) public view returns (uint256) {
        return funds[fund].mild;
    }

    function mald(bytes32 fund) public view returns (uint256) {
        return funds[fund].mald;
    }

    function lint(bytes32 fund) public view returns (uint256) {
        return funds[fund].lint;
    }

    function lpen(bytes32 fund) public view returns (uint256) {
        return funds[fund].lpen;
    }

    function lfee(bytes32 fund) public view returns (uint256) {
        return funds[fund].lfee;
    }

    function agent(bytes32 fund) public view returns (address) {
        return funds[fund].agent;
    }

    function bal(bytes32 fund) public view returns (uint256) {
        return funds[fund].bal;
    }

    function open(
        uint256 mila_,  // Min Loan Amount
        uint256 mala_,  // Max Loan Amount
        uint256 mild_,  // Min Loan Duration
        uint256 mald_,  // Max Loan Duration
        uint256 rat_,   // Liquidation Ratio (to 6 decimal places)
        uint256 lint_,  // Hourly Interest Rate to ten decimal places (i.e. 0.000799086758% would be inputed as 7990868)
        uint256 lpen_,  // Liquidation Penalty Rate
        uint256 lfee_,  // Optional Automation Fee Rate
        address agent_, // Optional Address Automated Agent
        ERC20   tok_,   // Debt Token
        bytes4  ccoin_  // Collateral Coin Number based on BIP 44
    ) public returns (bytes32 fund) {
        fundi = add(fundi, 1);
        fund = bytes32(fundi);
        funds[fund].own   = msg.sender; // Loan Fund Owner (Lender)
        funds[fund].mila  = mila_;      // Min Loan Amount
        funds[fund].mala  = mala_;      // Max Loan Amount
        funds[fund].mild  = mild_;      // Min Loan Duration
        funds[fund].mald  = mald_;      // Max Loan Duration
        funds[fund].lint  = lint_;
        funds[fund].lpen  = lpen_;
        funds[fund].lfee  = lfee_;
        funds[fund].rat   = rat_;
        funds[fund].tok   = tok_;
        funds[fund].agent = agent_;

        if (tokas[address(tok_)] == false) {
            tok_.approve(address(loans), 2**256-1);
            tokas[address(tok_)] = true;
        }
    }

    function push(bytes32 fund, uint256 amt) public {
        require(msg.sender == own(fund));
        funds[fund].tok.transferFrom(msg.sender, address(this), amt);
        funds[fund].bal = add(funds[fund].bal, amt);
    }

    function gen(bytes32[] memory sechs_) public { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < sechs_.length; i++) {
            sechs[msg.sender].push(sechs_[i]);
        }
    }

    function set(bytes memory pubk) public {
        pubks[msg.sender] = pubk;
    }

    function set(
        bytes32  fund,  // Loan Fund Index
        uint256  mila,  // Min Loan Amount
        uint256  mala,  // Max Loan Amount
        uint256  mild,  // Min Loan Duration
        uint256  mald,  // Max Loan Duration
        uint256  lint,  // Interest Rate in RAY
        uint256  lpen,  // Liquidation Penalty Rate in RAY
        uint256  lfee,  // Optional Automation Fee in RAY
        uint256  rat,   // Liquidation Ratio in RAY
        address  agent  // Optional Automator Agent)
    ) public {
        require(msg.sender == own(fund));
        funds[fund].mila  = mila;      // Min Loan Amount
        funds[fund].mala  = mala;      // Max Loan Amount
        funds[fund].mild  = mild;      // Min Loan Duration
        funds[fund].mald  = mald;      // Max Loan Duration
        funds[fund].lint  = lint;
        funds[fund].lpen  = lpen;
        funds[fund].lfee  = lfee;
        funds[fund].rat   = rat;
        funds[fund].agent = agent;
    }

    function calc(uint256 amt, uint256 rate, uint256 lodu) public returns (uint256) { // Calculate interest
        return sub(amt, rdiv(amt, rpow(rate, lodu)));
    }

    function req(
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_,  // Loan Duration in seconds
        bytes32[4] memory sechs_, // Secret Hash A1 & A2
        bytes      memory pubk_  // Pubkey
    ) public { // Request Loan
        require(msg.sender != own(fund));
        require(amt_       <= bal(fund));
        require(amt_       >= mila(fund));
        require(amt_       <= mala(fund));
        require(lodu_      >= mild(fund));
        require(lodu_      <= mald(fund));

        bytes32 loani = lopen(fund, amt_, col_, lodu_);
        lsech(fund, loani, sechs_, pubk_);
    }

    function lopen( // Private Open Loan
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_   // Loan Duration in seconds
    ) private returns (bytes32 loani) {
        bytes32 loani = loans.open(
            now + lodu_,
            [ msg.sender, own(fund), funds[fund].agent],
            [ amt_, calc(amt_, lint(fund), lodu_), calc(amt_, lpen(fund), lodu_), calc(amt_, lfee(fund), lodu_), col_, funds[fund].rat],
            funds[fund].tok,
            fund
        );
    }

    function gsech(address addr) private returns (bytes32[4] memory) { // Get 4 secrethashes for loan
        require((sechs[addr].length - sechi[addr]) >= 4);
        return [ sechs[addr][add(sechi[addr], 1)], sechs[addr][add(sechi[addr], 2)], sechs[addr][add(sechi[addr], 3)], sechs[addr][add(sechi[addr], 4)] ];
    }

    function lsech(bytes32 fund, bytes32 loan, bytes32[4] memory sechs, bytes memory pubk) private { // Loan set Secret Hash and PubKey
        loans.setSechs(
            loan,
            sechs,
            gsech(own(fund)),
            gsech(agent(fund)),
            pubk,
            pubks[own(fund)]
        );
    }

    function pull(bytes32 fund, uint256 amt) public {
        require(msg.sender == own(fund));
        require(bal(fund)  >= amt);
        funds[fund].tok.transfer(own(fund), amt);
        funds[fund].bal = sub(funds[fund].bal, amt);
    }
}