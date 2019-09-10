import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './DSMath.sol';

pragma solidity ^0.5.8;

contract Funds is DSMath {
    Loans loans;

    uint256 public constant DEFAULT_LIQUIDATION_RATIO = 1400000000000000000000000000;  // 140% (1.4x in RAY) minimum collateralization ratio
    uint256 public constant DEFAULT_LIQUIDATION_PENALTY = 1000000000937303470807876289; // 3% (3 in RAY) liquidation penalty
    uint256 public constant DEFAULT_AGENT_FEE = 1000000000236936036262880196; // 0.75% (0.75 in RAY) optional agent fee
    uint256 public constant DEFAULT_MIN_LOAN_AMT = 20000000000000000000; // Min 20 WAD
    uint256 public constant DEFAULT_MAX_LOAN_AMT = 2**256-1; // Max 2**256
    uint256 public constant DEFAULT_MIN_LOAN_DUR = 21600; // 6 hours
    uint256 public constant NUM_SECONDS_IN_YEAR = 31536000;

    mapping (address => bytes32[]) public secretHashes;    // User secret hashes
    mapping (address => uint256)   public secretHashIndex; // User secret hash index

    mapping (address => bytes)     public pubKeys;  // User A Coin PubKeys
    
    mapping (bytes32 => Fund)      public funds;
    mapping (address => Fund)      public fundOwner;
    uint256                        public fundIndex;

    uint256 public lastGlobalInterestUpdated;
    uint256 public marketLiquidity;
    uint256 public totalBorrow;
    uint256 public globalInterestRateNumerator;

    uint256 public lastUtilizationRatio;
    uint256 public globalInterestRate;
    uint256 public maxUtilizationDelta;
    uint256 public utilizationInterestDivisor;
    uint256 public maxInterestRateNumerator;
    uint256 public minInterestRateNumerator;
    uint256 public interestUpdateDelay;

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
        bool     custom;
    }

    constructor(ERC20 token_) public {
        deployer = msg.sender;
        token = token_;
        utilizationInterestDivisor = 10531702972595856680093239305; // 10.53 in RAY (~10:1 ratio for % change in utilization ratio to % change in interest rate)
        maxUtilizationDelta = 95310179948351216961192521; // Global Interest Rate Numerator can change up to 9.53% in RAY (~10% change in utilization ratio = ~1% change in interest rate)
        globalInterestRateNumerator =  95310179948351216961192521; // ~10%  ( (e^(ln(1.100)/(60*60*24*365)) - 1) * (60*60*24*365) )
        maxInterestRateNumerator    = 182321557320989604265864303; // ~20%  ( (e^(ln(1.200)/(60*60*24*365)) - 1) * (60*60*24*365) )
        minInterestRateNumerator    =  24692612600038629323181834; // ~2.5% ( (e^(ln(1.025)/(60*60*24*365)) - 1) * (60*60*24*365) )
        interestUpdateDelay = 86400; // 1 DAY
        globalInterestRate = add(RAY, div(globalInterestRateNumerator, NUM_SECONDS_IN_YEAR)); // Interest rate per second

        // utilizationInterestDivisor calculation (this is aiming for utilizationInterestDivisor to allow max change from 10% APR to be 11% APR despite using compound interest)
        // 1 + (globalInterestRateNumerator + (maxUtilizationDelta * RAY) / utilizationInterestDivisor) / NUM_SECONDS_IN_YEAR = 11% interest per second
        // utilizationInterestDivisor = (maxUtilizationDelta * RAY) / ( (11% interest per second - 1)(NUM_SECONDS_IN_YEAR) - globalInterestRateNumerator )
        // utilizationInterestDivisor = ((e^(ln(1.100)/(60*60*24*365)) - 1) * (60*60*24*365) * (10^27)) / ( (( e^(ln(1.110)/(60*60*24*365)) -1 ) * ( 60*60*24*365 )) - ((e^(ln(1.100)/(60*60*24*365)) - 1) * (60*60*24*365)))
    }

    function setLoans(Loans loans_) public {
        require(msg.sender == deployer);
        require(address(loans) == address(0));
        loans = loans_;
        require(token.approve(address(loans_), 2**256-1));
    }

    // NOTE: THE FOLLOWING FUNCTIONS ALLOW VARIABLES TO BE MODIFIED BY THE 
    //       DEPLOYER, SINCE THE ALGORITHM FOR CALCULATING GLOBAL INTEREST 
    //       RATE IS UNTESTED WITH A DECENTRALIZED PROTOCOL, AND MAY NEED TO
    //       BE UPDATED IN THE CASE THAT RATES DO NOT UPDATE AS INTENDED. A 
    //       FUTURE ITERATION OF THE PROTOCOL WILL REMOVE THESE FUNCTIONS. IF 
    //       YOU WISH TO OPT OUT OF GLOBAL APR YOU CAN CREATE A CUSTOM LOAN FUND
    // ======================================================================
    function setUtilizationInterestDivisor(uint256 utilizationInterestDivisor_) external {
        require(msg.sender == deployer);
        utilizationInterestDivisor = utilizationInterestDivisor_;
    }

    function setMaxUtilizationDelta(uint256 maxUtilizationDelta_) external {
        require(msg.sender == deployer);
        maxUtilizationDelta = maxUtilizationDelta_;
    }

    function setGlobalInterestRateNumerator(uint256 globalInterestRateNumerator_) external {
        require(msg.sender == deployer);
        globalInterestRateNumerator = globalInterestRateNumerator_;
    }

    function setGlobalInterestRate(uint256 globalInterestRate_) external {
        require(msg.sender == deployer);
        globalInterestRate = globalInterestRate_;
    }

    function setMaxInterestRateNumerator(uint256 maxInterestRateNumerator_) external {
        require(msg.sender == deployer);
        maxInterestRateNumerator = maxInterestRateNumerator_;
    }

    function setMinInterestRateNumerator(uint256 minInterestRateNumerator_) external {
        require(msg.sender == deployer);
        minInterestRateNumerator = minInterestRateNumerator_;
    }

    function setInterestUpdateDelay(uint256 interestUpdateDelay_) external {
        require(msg.sender == deployer);
        interestUpdateDelay = interestUpdateDelay_;
    }
    // ======================================================================

    function lender(bytes32 fund) public view returns (address) {
        return funds[fund].lender;
    }

    function minLoanAmt(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].minLoanAmt; }
        else                    { return DEFAULT_MIN_LOAN_AMT; }
    }

    function maxLoanAmt(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].maxLoanAmt; }
        else                    { return DEFAULT_MAX_LOAN_AMT; }
    }

    function minLoanDur(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].minLoanDur; }
        else                    { return DEFAULT_MIN_LOAN_DUR; }
    }

    function maxLoanDur(bytes32 fund) public view returns (uint256) {
        return funds[fund].maxLoanDur;
    }

    function interest(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].interest; }
        else                    { return globalInterestRate; }
    }

    function penalty(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].penalty; }
        else                    { return DEFAULT_LIQUIDATION_PENALTY; }
    }

    function fee(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].fee; }
        else                    { return DEFAULT_AGENT_FEE; }
    }

    function liquidationRatio(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].liquidationRatio; }
        else                    { return DEFAULT_LIQUIDATION_RATIO; }
    }

    function agent(bytes32 fund)   public view returns (address) {
        return funds[fund].agent;
    }

    function balance(bytes32 fund) public view returns (uint256) {
        return funds[fund].balance;
    }

    function custom(bytes32 fund) public view returns (bool) {
        return funds[fund].custom;
    }

    function create(
        uint256  maxLoanDur_,       // Max Loan Duration
        address  agent_             // Optional Address Automated Agent
    ) external returns (bytes32 fund) {
        require(fundOwner[msg.sender].lender != msg.sender); // Only allow one loan fund per address
        fundIndex = add(fundIndex, 1);
        fund = bytes32(fundIndex);
        funds[fund].lender           = msg.sender;
        funds[fund].maxLoanDur       = maxLoanDur_;
        funds[fund].agent            = agent_;
        funds[fund].custom           = false;
    }

    function createCustom(
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
        require(fundOwner[msg.sender].lender != msg.sender); // Only allow one loan fund per address
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
        funds[fund].custom           = true;
    }

    function deposit(bytes32 fund, uint256 amount) external { // Deposit funds to Loan Fund
        // require(msg.sender == lender(fund) || msg.sender == address(loans)); // NOTE: this require is not necessary. Anyone can fund someone elses loan fund
        funds[fund].balance = add(funds[fund].balance, amount);
        require(token.transferFrom(msg.sender, address(this), amount));
        if (funds[fund].custom == false) {
            marketLiquidity = add(marketLiquidity, amount);
            calcGlobalInterest();
        }
    }

    function generate(bytes32[] calldata secretHashes_) external { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < secretHashes_.length; i++) {
            secretHashes[msg.sender].push(secretHashes_[i]);
        }
    }

    function setPubKey(bytes calldata pubKey) external { // Set PubKey for Fund
        pubKeys[msg.sender] = pubKey;
    }


    function increaseMarketLiquidity(uint256 amount) external {
        require(msg.sender == address(loans));
        marketLiquidity = add(marketLiquidity, amount);
    }

    function decreaseMarketLiquidity(uint256 amount) external {
        require(msg.sender == address(loans));
        marketLiquidity = sub(marketLiquidity, amount);
    }

    function increaseTotalBorrow(uint256 amount) external {
        require(msg.sender == address(loans));
        totalBorrow = add(totalBorrow, amount);
    }

    function decreaseTotalBorrow(uint256 amount) external {
        require(msg.sender == address(loans));
        totalBorrow = sub(totalBorrow, amount);
    }

    function calcGlobalInterest() public {
        // if utilizationRatio increases newAPR = oldAPR + (min(10%, utilizationRatio) / 10)
        // if utilizationRatio decreases newAPR = oldAPR - (max(10%, utilizationRatio) / 10)
        // ΔAPR should be less than or equal to 1%
        // For every 10% change in utilization ratio, the interest rate will change a maximum of 1%
        // i.e. newAPR = 11.5% + (10% / 10) = 12.5%

        if (now > (lastGlobalInterestUpdated + interestUpdateDelay)) { // Only updates if globalInterestRate hasn't been changed in over a day
            uint256 utilizationRatio = rdiv(totalBorrow, add(marketLiquidity, totalBorrow));

            if (utilizationRatio > lastUtilizationRatio) {
                uint256 changeUtilizationRatio = sub(utilizationRatio, lastUtilizationRatio);
                globalInterestRateNumerator = min(maxInterestRateNumerator, add(globalInterestRateNumerator, rdiv(min(maxUtilizationDelta, changeUtilizationRatio), utilizationInterestDivisor)));
            } else {
                uint256 changeUtilizationRatio = sub(lastUtilizationRatio, utilizationRatio);
                globalInterestRateNumerator = max(minInterestRateNumerator, sub(globalInterestRateNumerator, rdiv(min(maxUtilizationDelta, changeUtilizationRatio), utilizationInterestDivisor)));
            }

            globalInterestRate = add(RAY, div(globalInterestRateNumerator, NUM_SECONDS_IN_YEAR)); // Interest rate per second

            lastGlobalInterestUpdated = now;
            lastUtilizationRatio = utilizationRatio;
        }
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

    function withdraw(bytes32 fund, uint256 amount) external { // Withdraw funds from Loan Fund
        require(msg.sender     == lender(fund));
        require(balance(fund)  >= amount);
        funds[fund].balance = sub(funds[fund].balance, amount);
        require(token.transfer(lender(fund), amount));
        if (funds[fund].custom == false) {
            marketLiquidity = sub(marketLiquidity, amount);
            calcGlobalInterest();
        }
    }

    function calcInterest(uint256 amount, uint256 rate, uint256 loanDur) public pure returns (uint256) { // Calculate interest
        return sub(rmul(amount, rpow(rate, loanDur)), amount);
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
            [ amount_, calcInterest(amount_, interest(fund), loanDur_), calcInterest(amount_, penalty(fund), loanDur_), calcInterest(amount_, fee(fund), loanDur_), collateral_, liquidationRatio(fund)],
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
