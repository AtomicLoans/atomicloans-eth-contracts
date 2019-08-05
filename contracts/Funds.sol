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
    uint256                        public fundIndex;

    ERC20 public token;

    address deployer;

    struct Fund {
        address  lend;             // Loan Fund Owner (Lender)
        uint256  minLoanAmt;       // Min Loan Amount
        uint256  maxLoanAmt;       // Max Loan Amount
        uint256  minLoanDur;       // Min Loan Duration
        uint256  maxLoanDur;       // Max Loan Duration
        uint256  interest;         // Interest Rate in RAY
        uint256  penalty;          // Liquidation Penalty Rate in RAY
        uint256  fee;              // Optional Automation Fee in RAY
        uint256  liquidationRatio; // Liquidation Ratio in RAY
        address  agent;            // Optional Automator Agent
        uint256  balance;          // Locked amount in fund (in TOK)
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

    function lend(bytes32 fund)    public view returns (address) {
        return funds[fund].lend;
    }

    function minLoanAmt(bytes32 fund)    public view returns (uint256) {
        return funds[fund].minLoanAmt;
    }

    function maxLoanAmt(bytes32 fund)    public view returns (uint256) {
        return funds[fund].maxLoanAmt;
    }

    function minLoanDur(bytes32 fund)    public view returns (uint256) {
        return funds[fund].minLoanDur;
    }

    function maxLoanDur(bytes32 fund)    public view returns (uint256) {
        return funds[fund].maxLoanDur;
    }

    function interest(bytes32 fund)    public view returns (uint256) {
        return funds[fund].interest;
    }

    function penalty(bytes32 fund)    public view returns (uint256) {
        return funds[fund].penalty;
    }

    function fee(bytes32 fund)    public view returns (uint256) {
        return funds[fund].fee;
    }

    function liquidationRatio(bytes32 fund)     public view returns (uint256) {
        return funds[fund].liquidationRatio;
    }

    function agent(bytes32 fund)   public view returns (address) {
        return funds[fund].agent;
    }

    function balance(bytes32 fund) public view returns (uint256) {
        return funds[fund].balance;
    }

    function create(
        uint256  minLoanAmt_,       // Min Loan Amount
        uint256  maxLoanAmt_,       // Max Loan Amount
        uint256  minLoanDur_,       // Min Loan Duration
        uint256  maxLoanDur_,       // Max Loan Duration
        uint256  liquidationRatio_, // Liquidation Ratio
        uint256  interest_,         // Interest Rate
        uint256  penalty_,          // Liquidation Penalty Rate
        uint256  fee_,              // Optional Automation Fee Rate
        address  agent_             // Optional Address Automated Agent
    ) external returns (bytes32 fund) {
        fundIndex = add(fundIndex, 1);
        fund = bytes32(fundIndex);
        funds[fund].lend             = msg.sender;
        funds[fund].minLoanAmt       = minLoanAmt_;
        funds[fund].maxLoanAmt       = maxLoanAmt_;
        funds[fund].minLoanDur       = minLoanDur_;
        funds[fund].maxLoanDur       = maxLoanDur_;
        funds[fund].interest         = interest_;
        funds[fund].penalty          = penalty_;
        funds[fund].fee              = fee_;
        funds[fund].liquidationRatio = liquidationRatio_;
        funds[fund].agent            = agent_;
    }

    function deposit(bytes32 fund, uint256 amt) external { // Deposit funds to Loan Fund
        // require(msg.sender == lend(fund) || msg.sender == address(loans)); // NOTE: this require is not necessary. Anyone can fund someone elses loan fund
        funds[fund].balance = add(funds[fund].balance, amt);
        require(token.transferFrom(msg.sender, address(this), amt));
    }

    function generate(bytes32[] calldata sechs_) external { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < sechs_.length; i++) {
            sechs[msg.sender].push(sechs_[i]);
        }
    }

    function update(bytes calldata pubk) external { // Set PubKey for Fund
        pubks[msg.sender] = pubk;
    }

    function update(                // Set Loan Fund details
        bytes32  fund,              // Loan Fund Index
        uint256  minLoanAmt_,       // Min Loan Amount
        uint256  maxLoanAmt_,       // Max Loan Amount
        uint256  minLoanDur_,       // Min Loan Duration
        uint256  maxLoanDur_,       // Max Loan Duration
        uint256  interest_,         // Interest Rate in RAY
        uint256  penalty_,          // Liquidation Penalty Rate in RAY
        uint256  fee_,              // Optional Automation Fee in RAY
        uint256  liquidationRatio_, // Liquidation Ratio in RAY
        address  agent_             // Optional Automator Agent)
    ) external {
        require(msg.sender == lend(fund));
        funds[fund].minLoanAmt       = minLoanAmt_;
        funds[fund].maxLoanAmt       = maxLoanAmt_;
        funds[fund].minLoanDur       = minLoanDur_;
        funds[fund].maxLoanDur       = maxLoanDur_;
        funds[fund].interest         = interest_;
        funds[fund].penalty          = penalty_;
        funds[fund].fee              = fee_;
        funds[fund].liquidationRatio = liquidationRatio_;
        funds[fund].agent            = agent_;
    }

    function request(                 // Request Loan
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_,  // Loan Duration in seconds
        bytes32[4] calldata sechs_, // Secret Hash A1 & A2
        bytes      calldata pubk_   // Pubkey
    ) external returns (bytes32 loani) {
        require(msg.sender != lend(fund));
        require(amt_       <= balance(fund));
        require(amt_       >= minLoanAmt(fund));
        require(amt_       <= maxLoanAmt(fund));
        require(lodu_      >= minLoanDur(fund));
        require(lodu_      <= maxLoanDur(fund));

        loani = lcreate(fund, amt_, col_, lodu_);
        lsech(fund, loani, sechs_, pubk_);
        loans.push(loani);
    }

    function withdraw(bytes32 fund, uint256 amt) external { // Withdraw funds from Loan Fund
        require(msg.sender     == lend(fund));
        require(balance(fund)  >= amt);
        funds[fund].balance = sub(funds[fund].balance, amt);
        require(token.transfer(lend(fund), amt));
    }

    function calc(uint256 amt, uint256 rate, uint256 lodu) public pure returns (uint256) { // Calculate interest
        return sub(rmul(amt, rpow(rate, lodu)), amt);
    }

    function lcreate(             // Private Open Loan
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_   // Loan Duration in seconds
    ) private returns (bytes32 loani) {
        loani = loans.create(
            now + lodu_,
            [ msg.sender, lend(fund), funds[fund].agent],
            [ amt_, calc(amt_, interest(fund), lodu_), calc(amt_, penalty(fund), lodu_), calc(amt_, fee(fund), lodu_), col_, funds[fund].liquidationRatio],
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
