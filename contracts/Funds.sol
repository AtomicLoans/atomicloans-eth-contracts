import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './DSMath.sol';

pragma solidity ^0.5.8;

contract Funds is DSMath {
    Loans loans;

    mapping (address => bytes32[]) public secretHashes;    // User secret hashes
    mapping (address => uint256)   public secretHashIndex; // User secret hash index

    mapping (address => bytes)     public pubKeys;  // User A Coin PubKeys
    
    mapping (bytes32 => Fund)      public funds;  
    uint256                        public fundIndex;

    ERC20 public token;

    address deployer;

    struct Fund {
        address  lender;           // Loan Fund Owner (Lender)
        uint256  minLoanAmt;       // Min Loan Amount
        uint256  maxLoanAmt;       // Max Loan Amount
        uint256  minLoanDur;       // Min Loan Duration
        uint256  maxLoanDur;       // Max Loan Duration
        uint256  interest;         // Interest Rate in RAY
        uint256  penalty;          // Liquidation Penalty Rate in RAY
        uint256  fee;              // Optional Automation Fee in RAY
        uint256  liquidationRatio; // Liquidation Ratio in RAY
        address  agent;            // Optional Automator Agent
        uint256  balance;          // Locked amount in fund (in token)
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

    function lender(bytes32 fund)    public view returns (address) {
        return funds[fund].lender;
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
        funds[fund].lender           = msg.sender;
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

    function deposit(bytes32 fund, uint256 amount) external { // Deposit funds to Loan Fund
        // require(msg.sender == lender(fund) || msg.sender == address(loans)); // NOTE: this require is not necessary. Anyone can fund someone elses loan fund
        funds[fund].balance = add(funds[fund].balance, amount);
        require(token.transferFrom(msg.sender, address(this), amount));
    }

    function generate(bytes32[] calldata secretHashes_) external { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < secretHashes_.length; i++) {
            secretHashes[msg.sender].push(secretHashes_[i]);
        }
    }

    function setPubKey(bytes calldata pubKey) external { // Set PubKey for Fund
        pubKeys[msg.sender] = pubKey;
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
        require(msg.sender == lender(fund));
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

    function request(                      // Request Loan
        bytes32             fund,          // Fund Index
        uint256             amount_,       // Loan Amount
        uint256             collateral_,   // Collateral Amount in satoshis
        uint256             loanDur,       // Loan Duration in seconds
        bytes32[4] calldata secretHashes_, // Secret Hash A1 & A2
        bytes      calldata pubKey_        // Pubkey
    ) external returns (bytes32 loanIndex) {
        require(msg.sender != lender(fund));
        require(amount_    <= balance(fund));
        require(amount_    >= minLoanAmt(fund));
        require(amount_    <= maxLoanAmt(fund));
        require(loanDur    >= minLoanDur(fund));
        require(loanDur    <= maxLoanDur(fund));

        loanIndex = createLoan(fund, amount_, collateral_, loanDur);
        loanSetSecretHashes(fund, loanIndex, secretHashes_, pubKey_);
        loans.fund(loanIndex);
    }

    function withdraw(bytes32 fund, uint256 amt) external { // Withdraw funds from Loan Fund
        require(msg.sender     == lender(fund));
        require(balance(fund)  >= amt);
        funds[fund].balance = sub(funds[fund].balance, amt);
        require(token.transfer(lender(fund), amt));
    }

    function calcInterest(uint256 amt, uint256 rate, uint256 lodu) public pure returns (uint256) { // Calculate interest
        return sub(rmul(amt, rpow(rate, lodu)), amt);
    }

    function createLoan(      // Private Loan Create
        bytes32  fund,        // Fund Index
        uint256  amount_,     // Loan Amount
        uint256  collateral_, // Collateral Amount in satoshis
        uint256  loanDur_     // Loan Duration in seconds
    ) private returns (bytes32 loanIndex) {
        loanIndex = loans.create(
            now + loanDur_,
            [ msg.sender, lender(fund), funds[fund].agent],
            [ amount_, calcInterest(amount_, interest(fund), loanDur_), calcInterest(amount_, penalty(fund), loanDur_), calcInterest(amount_, fee(fund), loanDur_), collateral_, funds[fund].liquidationRatio],
            fund
        );
    }

    function loanSetSecretHashes(        // Loan Set Secret Hashes
        bytes32           fund,          // Fund Index
        bytes32           loan,          // Loan Index
        bytes32[4] memory secretHashes_, // 4 Secret Hashes
        bytes      memory pubKey_        // Public Key
    ) private { // Loan set Secret Hash and PubKey
        loans.setSecretHashes(
            loan,
            secretHashes_,
            getSecretHashesForLoan(lender(fund)),
            getSecretHashesForLoan(agent(fund)),
            pubKey_,
            pubKeys[lender(fund)],
            pubKeys[agent(fund)]
        );
    }

    function getSecretHashesForLoan(address addr) private returns (bytes32[4] memory) { // Get 4 secrethashes for loan
        secretHashIndex[addr] = add(secretHashIndex[addr], 4);
        return [
            secretHashes[addr][sub(secretHashIndex[addr], 4)],
            secretHashes[addr][sub(secretHashIndex[addr], 3)],
            secretHashes[addr][sub(secretHashIndex[addr], 2)],
            secretHashes[addr][sub(secretHashIndex[addr], 1)]
        ];
    }
}
