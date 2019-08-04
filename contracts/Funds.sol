import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './DSMath.sol';

pragma solidity ^0.5.8;

contract Funds is DSMath {
    Loans loans;

    mapping (address => bytes32[]) public sechs;  // User secret hashes
    mapping (address => uint256)   public sechi;  // User secret hash index

    mapping (address => bytes)     public pubks;  // User A Coin PubKeys
    
    mapping (bytes32 => Fund)      public funds;  
    uint256                        public fundi;

    ERC20 public token;

    address deployer;

    struct Fund {
        address  lend;   // Loan Fund Owner (Lender)
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
    }

    constructor(ERC20 token_) public {
        deployer = msg.sender;
        token = token_;
    }

    function setLoans(Loans loans_) public {
        require(msg.sender == deployer);
        require(address(loans) == address(0));
        loans = loans_;
        require(token.approve(address(loans_), 2**256-1));
    }

    function lend(bytes32 fund)   public view returns (address) {
        return funds[fund].lend;
    }

    function mila(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mila;
    }

    function mala(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mala;
    }

    function mild(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mild;
    }

    function mald(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mald;
    }

    function lint(bytes32 fund)  public view returns (uint256) {
        return funds[fund].lint;
    }

    function lpen(bytes32 fund)  public view returns (uint256) {
        return funds[fund].lpen;
    }

    function lfee(bytes32 fund)  public view returns (uint256) {
        return funds[fund].lfee;
    }

    function rat(bytes32 fund)   public view returns (uint256) {
        return funds[fund].rat;
    }

    function agent(bytes32 fund) public view returns (address) {
        return funds[fund].agent;
    }

    function bal(bytes32 fund)   public view returns (uint256) {
        return funds[fund].bal;
    }

    function open(
        uint256  mila_,  // Min Loan Amount
        uint256  mala_,  // Max Loan Amount
        uint256  mild_,  // Min Loan Duration
        uint256  mald_,  // Max Loan Duration
        uint256  rat_,   // Liquidation Ratio
        uint256  lint_,  // Interest Rate
        uint256  lpen_,  // Liquidation Penalty Rate
        uint256  lfee_,  // Optional Automation Fee Rate
        address  agent_  // Optional Address Automated Agent
    ) external returns (bytes32 fund) {
        fundi = add(fundi, 1);
        fund = bytes32(fundi);
        funds[fund].lend  = msg.sender;
        funds[fund].mila  = mila_;
        funds[fund].mala  = mala_;
        funds[fund].mild  = mild_;
        funds[fund].mald  = mald_;
        funds[fund].lint  = lint_;
        funds[fund].lpen  = lpen_;
        funds[fund].lfee  = lfee_;
        funds[fund].rat   = rat_;
        funds[fund].agent = agent_;
    }

    function push(bytes32 fund, uint256 amt) external { // Push funds to Loan Fund
        // require(msg.sender == lend(fund) || msg.sender == address(loans)); // NOTE: this require is not necessary. Anyone can fund someone elses loan fund
        funds[fund].bal = add(funds[fund].bal, amt);
        require(token.transferFrom(msg.sender, address(this), amt));
    }

    function gen(bytes32[] calldata sechs_) external { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < sechs_.length; i++) {
            sechs[msg.sender].push(sechs_[i]);
        }
    }

    function set(bytes calldata pubk) external { // Set PubKey for Fund
        pubks[msg.sender] = pubk;
    }

    function set(        // Set Loan Fund details
        bytes32  fund,   // Loan Fund Index
        uint256  mila_,  // Min Loan Amount
        uint256  mala_,  // Max Loan Amount
        uint256  mild_,  // Min Loan Duration
        uint256  mald_,  // Max Loan Duration
        uint256  lint_,  // Interest Rate in RAY
        uint256  lpen_,  // Liquidation Penalty Rate in RAY
        uint256  lfee_,  // Optional Automation Fee in RAY
        uint256  rat_,   // Liquidation Ratio in RAY
        address  agent_  // Optional Automator Agent)
    ) external {
        require(msg.sender == lend(fund));
        funds[fund].mila  = mila_;
        funds[fund].mala  = mala_;
        funds[fund].mild  = mild_;
        funds[fund].mald  = mald_;
        funds[fund].lint  = lint_;
        funds[fund].lpen  = lpen_;
        funds[fund].lfee  = lfee_;
        funds[fund].rat   = rat_;
        funds[fund].agent = agent_;
    }

    function req(                 // Request Loan
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_,  // Loan Duration in seconds
        bytes32[4] calldata sechs_, // Secret Hash A1 & A2
        bytes      calldata pubk_   // Pubkey
    ) external returns (bytes32 loani) {
        require(msg.sender != lend(fund));
        require(amt_       <= bal(fund));
        require(amt_       >= mila(fund));
        require(amt_       <= mala(fund));
        require(lodu_      >= mild(fund));
        require(lodu_      <= mald(fund));

        loani = lopen(fund, amt_, col_, lodu_);
        lsech(fund, loani, sechs_, pubk_);
        loans.push(loani);
    }

    function pull(bytes32 fund, uint256 amt) external { // Pull funds from Loan Fund
        require(msg.sender == lend(fund));
        require(bal(fund)  >= amt);
        funds[fund].bal = sub(funds[fund].bal, amt);
        require(token.transfer(lend(fund), amt));
    }

    function calc(uint256 amt, uint256 rate, uint256 lodu) public pure returns (uint256) { // Calculate interest
        return sub(rmul(amt, rpow(rate, lodu)), amt);
    }

    function lopen(               // Private Open Loan
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_   // Loan Duration in seconds
    ) private returns (bytes32 loani) {
        loani = loans.open(
            now + lodu_,
            [ msg.sender, lend(fund), funds[fund].agent],
            [ amt_, calc(amt_, lint(fund), lodu_), calc(amt_, lpen(fund), lodu_), calc(amt_, lfee(fund), lodu_), col_, funds[fund].rat],
            fund
        );
    }

    function lsech(                // Loan Set Secret Hashes
        bytes32 fund,              // Fund Index
        bytes32 loan,              // Loan Index
        bytes32[4] memory sechs_,  // 4 Secret Hashes
        bytes memory pubk_         // Public Key
    ) private { // Loan set Secret Hash and PubKey
        loans.setSechs(
            loan,
            sechs_,
            gsech(lend(fund)),
            gsech(agent(fund)),
            pubk_,
            pubks[lend(fund)]
        );
    }

    function gsech(address addr) private returns (bytes32[4] memory) { // Get 4 secrethashes for loan
        sechi[addr] = add(sechi[addr], 4);
        return [ sechs[addr][sub(sechi[addr], 4)], sechs[addr][sub(sechi[addr], 3)], sechs[addr][sub(sechi[addr], 2)], sechs[addr][sub(sechi[addr], 1)] ];
    }
}
