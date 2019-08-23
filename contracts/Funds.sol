import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './ALCompound.sol';

pragma solidity ^0.5.8;

contract Funds is DSMath, ALCompound {
    Loans loans;

    uint256 public constant DEFAULT_LIQUIDATION_RATIO = 1400000000000000000000000000;  // 140% (1.4x in RAY) minimum collateralization ratio
    uint256 public constant DEFAULT_LIQUIDATION_PENALTY = 1000000000937303470807876289; // 3% (3 in RAY) liquidation penalty
    uint256 public constant DEFAULT_AGENT_FEE = 1000000000236936036262880196; // 0.75% (0.75 in RAY) optional agent fee
    uint256 public constant DEFAULT_MIN_LOAN_AMT = 10000000000000000000; // Min 10 WAD
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
    uint256 public tokenMarketLiquidity;
    uint256 public cTokenMarketLiquidity;
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
    uint256 public decimals;
    CTokenInterface public cToken;
    bool compoundSet;

    address deployer;

    /**
     * @notice Container for Loan Fund information
     * @member lender Loan Fund Owner
     * @member minLoanAmt Minimum Loan Amount that can be requested by a 'borrower'
     * @member maxLoanAmt Maximum Loan Amount that can be requested by a 'borrower'
     * @member minLoanDur Minimum Loan Duration that can be requested by a 'borrower'
     * @member maxLoanDur Maximum Loan Duration that can be requested by a 'borrower'
     * @member interest Interest Rate of Loan Fund in RAY per second
     * @member penalty Liquidation Penalty Rate of Loan Fund in RAY per second
     * @member fee Optional Automation Fee Rate of Loan Fund in RAY per second
     * @member liquidationRatio Liquidation Ratio of Loan Fund in RAY
     * @member agent Optional address of Automator Agent
     * @member balance Amount of non-borrowed tokens in Loan Fund
     * @member cBalance Amount of non-borrowed cTokens in Loan Fund
     * @member custom Indicator that this Loan Fund is custom and does not use global settings
     * @member compoundEnabled Indicator that this Loan Fund lends non-borrowed tokens on Compound
     */
    struct Fund {
        address  lender;
        uint256  minLoanAmt;
        uint256  maxLoanAmt;
        uint256  minLoanDur;
        uint256  maxLoanDur;
        uint256  interest;
        uint256  penalty;
        uint256  fee;
        uint256  liquidationRatio;
        address  agent;
        uint256  balance;
        uint256  cBalance;
        bool     custom;
        bool     compoundEnabled;
    }

    constructor(
        ERC20   token_,
        uint256 decimals_
    ) public {
        deployer = msg.sender;
        token = token_;
        decimals = decimals_;
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

    /**
     * @dev Sets Loans contract
     * @param loans_ Address of Loans contract
     */
    function setLoans(Loans loans_) public {
        require(msg.sender == deployer);
        require(address(loans) == address(0));
        loans = loans_;
        require(token.approve(address(loans_), 2**256-1));
    }

    /**
     * @dev Enables assets in loan fund that haven't been borrowed to be lent on Compound
     * @param cToken_ The address of the Compound Token
     * @param comptroller_ The address of the Compound Comptroller
     */
    function setCompound(CTokenInterface cToken_, address comptroller_) public {
        require(msg.sender == deployer);
        require(!compoundSet);
        cToken = cToken_;
        comptroller = comptroller_;
        compoundSet = true;
    }

    // NOTE: THE FOLLOWING FUNCTIONS ALLOW VARIABLES TO BE MODIFIED BY THE 
    //       DEPLOYER, SINCE THE ALGORITHM FOR CALCULATING GLOBAL INTEREST 
    //       RATE IS UNTESTED WITH A DECENTRALIZED PROTOCOL, AND MAY NEED TO
    //       BE UPDATED IN THE CASE THAT RATES DO NOT UPDATE AS INTENDED. A 
    //       FUTURE ITERATION OF THE PROTOCOL WILL REMOVE THESE FUNCTIONS. IF 
    //       YOU WISH TO OPT OUT OF GLOBAL APR YOU CAN CREATE A CUSTOM LOAN FUND
    // ======================================================================

    /**
     * @dev Sets the Utilization Interest Divisor
     */
    function setUtilizationInterestDivisor(uint256 utilizationInterestDivisor_) external {
        require(msg.sender == deployer);
        utilizationInterestDivisor = utilizationInterestDivisor_;
    }

    /**
     * @dev Sets the Max Utilization Delta
     */
    function setMaxUtilizationDelta(uint256 maxUtilizationDelta_) external {
        require(msg.sender == deployer);
        maxUtilizationDelta = maxUtilizationDelta_;
    }

    /**
     * @dev Sets the Global Interest Rate Numerator
     */
    function setGlobalInterestRateNumerator(uint256 globalInterestRateNumerator_) external {
        require(msg.sender == deployer);
        globalInterestRateNumerator = globalInterestRateNumerator_;
    }

    /**
     * @dev Sets the Global Interest Rate
     */
    function setGlobalInterestRate(uint256 globalInterestRate_) external {
        require(msg.sender == deployer);
        globalInterestRate = globalInterestRate_;
    }

    /**
     * @dev Sets the Maximum Interest Rate Numerator
     */
    function setMaxInterestRateNumerator(uint256 maxInterestRateNumerator_) external {
        require(msg.sender == deployer);
        maxInterestRateNumerator = maxInterestRateNumerator_;
    }

    /**
     * @dev Sets the Minimum Interest Rate Numerator
     */
    function setMinInterestRateNumerator(uint256 minInterestRateNumerator_) external {
        require(msg.sender == deployer);
        minInterestRateNumerator = minInterestRateNumerator_;
    }

    /**
     * @dev Sets the Interest Update Delay
     */
    function setInterestUpdateDelay(uint256 interestUpdateDelay_) external {
        require(msg.sender == deployer);
        interestUpdateDelay = interestUpdateDelay_;
    }
    // ======================================================================

    /**
     * @notice Get the lender of a Loan Fund
     * @param fund The Id of a Loan Fund
     * @return Owner address of Loan Fund
     */
    function lender(bytes32 fund) public view returns (address) {
        return funds[fund].lender;
    }

    /**
     * @notice Get minimum loan amount able to be requested by a 'borrower'
     * @param fund The Id of a Loan Fund
     * @return The minimum amount of tokens that can be requested from a Loan Fund
     */
    function minLoanAmt(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].minLoanAmt; }
        else                    { return div(DEFAULT_MIN_LOAN_AMT, (10 ** sub(18, decimals))); }
    }

    /**
     * @notice Get maximum loan amount able to be requested by a 'borrower'
     * @param fund The Id of a Loan Fund
     * @return The maximum amount of tokens that can be requested from a Loan Fund
     */
    function maxLoanAmt(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].maxLoanAmt; }
        else                    { return DEFAULT_MAX_LOAN_AMT; }
    }

    /**
     * @notice Get minimum loan duration able to be requested by a 'borrower'
     * @param fund The Id of a Loan Fund
     * @return The minimum duration loan that can be requested from a Loan Fund
     */
    function minLoanDur(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].minLoanDur; }
        else                    { return DEFAULT_MIN_LOAN_DUR; }
    }

    /**
     * @notice Get maximum loan duration able to be requested by a 'borrower'
     * @param fund The Id of a Loan Fund
     * @return The maximum duration loan that can be requested from a Loan Fund
     */
    function maxLoanDur(bytes32 fund) public view returns (uint256) {
        return funds[fund].maxLoanDur;
    }

    /**
     * @notice Get the interest rate for a Loan Fund
     * @param fund The Id of a Loan Fund
     * @return The interest rate per second for a Loan Fund in RAY per second
     */
    function interest(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].interest; }
        else                    { return globalInterestRate; }
    }

    /**
     * @notice Get the liquidation penalty rate for a Loan Fund
     * @param fund The Id of a Loan Fund
     * @return The liquidation penalty rate per second for a Loan Fund in RAY per second
     */
    function penalty(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].penalty; }
        else                    { return DEFAULT_LIQUIDATION_PENALTY; }
    }

    /**
     * @notice Get the optional automation fee for a Loan Fund
     * @param fund The Id of a Loan Fund
     * @return The optional automation fee rate of Loan Fund in RAY per second
     */
    function fee(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].fee; }
        else                    { return DEFAULT_AGENT_FEE; }
    }

    /**
     * @notice Get the liquidation ratio of a Loan Fund
     * @param fund The Id of a Loan Fund
     * @return The liquidation ratio of Loan Fund in RAY
     */
    function liquidationRatio(bytes32 fund) public view returns (uint256) {
        if (funds[fund].custom) { return funds[fund].liquidationRatio; }
        else                    { return DEFAULT_LIQUIDATION_RATIO; }
    }

    /**
     * @notice Get the agent for a Loan Fund
     * @param fund The Id of a Loan Fund
     * @return The address of the agent for a Loan fund
     */
    function agent(bytes32 fund)   public view returns (address) {
        return funds[fund].agent;
    }

    /**
     * @notice Get the current balance of a Loan Fund in tokens
     * @param fund The Id of a Loan Fund
     * @return The amount of tokens remaining in Loan Fund
     */
    function balance(bytes32 fund) public returns (uint256) {
        if (funds[fund].compoundEnabled) {
            return wmul(funds[fund].cBalance, cToken.exchangeRateCurrent());
        } else {
            return funds[fund].balance;
        }
    }

    /**
     * @notice Get the custom indicator for a Loan Fund
     * @param fund The Id of a Loan Fund
     * @return The indicator of whether a Loan Fund is custom or not
     */
    function custom(bytes32 fund) public view returns (bool) {
        return funds[fund].custom;
    }

    /**
     * @notice Lenders create Loan Fund using Global Protocol parameters and deposit assets
     * @param maxLoanDur_ Max Loan Duration of Loan Fund in seconds
     * @param agent_  Optional address of agent
     * @param compoundEnabled_ Indicator whether excess funds should be lent on Compound
     * @param amount_ Amount of tokens to be deposited on creation
     * @return The Id of a Loan Fund
     *
     *         Note: Only one loan fund is allowed per ethereum address.
     *               Exception is made for the deployer for testing.
     */
    function create(
        uint256  maxLoanDur_,
        address  agent_,
        bool     compoundEnabled_,
        uint256  amount_
    ) external returns (bytes32 fund) { 
        require(fundOwner[msg.sender].lender != msg.sender || msg.sender == deployer); // Only allow one loan fund per address
        if (!compoundSet) { require(compoundEnabled_ == false); }
        fundIndex = add(fundIndex, 1);
        fund = bytes32(fundIndex);
        funds[fund].lender           = msg.sender;
        funds[fund].maxLoanDur       = maxLoanDur_;
        funds[fund].agent            = agent_;
        funds[fund].custom           = false;
        funds[fund].compoundEnabled  = compoundEnabled_;
        fundOwner[msg.sender]        = funds[fund];
        if (amount_ > 0) { deposit(fund, amount_); }
    }

    /**
     * @notice Lenders create Loan Fund using Custom parameters and deposit assets
     * @param minLoanAmt_ Minimum amount of tokens that can be borrowed from Loan Fund
     * @param maxLoanAmt_ Maximum amount of tokens that can be borrowed from Loan Fund
     * @param minLoanDur_ Minimum length of loan that can be requested from Loan Fund in seconds
     * @param maxLoanDur_ Maximum length of loan that can be requested from Loan Fund in seconds
     * @param agent_  Optional address of agent
     * @param compoundEnabled_ Indicator whether excess funds should be lent on Compound
     * @param amount_ Amount of tokens to be deposited on creation
     * @return The Id of a Loan Fund
     *
     *         Note: Only one loan fund is allowed per ethereum address.
     *               Exception is made for the deployer for testing.
     */
    function createCustom(
        uint256  minLoanAmt_,
        uint256  maxLoanAmt_,
        uint256  minLoanDur_,
        uint256  maxLoanDur_,
        uint256  liquidationRatio_,
        uint256  interest_,
        uint256  penalty_,
        uint256  fee_,
        address  agent_,
        bool     compoundEnabled_,
        uint256  amount_
    ) external returns (bytes32 fund) {
        require(fundOwner[msg.sender].lender != msg.sender || msg.sender == deployer); // Only allow one loan fund per address
        if (!compoundSet) { require(compoundEnabled_ == false); }
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
        funds[fund].compoundEnabled  = compoundEnabled_;
        fundOwner[msg.sender]        = funds[fund];
        if (amount_ > 0) { deposit(fund, amount_); }
    }

    /**
     * @notice Lenders deposit tokens in Loan Fund
     * @param fund The Id of a Loan Fund
     * @param amount Amount of tokens to deposit
     *
     *        Note: Anyone can deposit tokens into a Loan Fund
     */
    function deposit(bytes32 fund, uint256 amount) public {
        require(token.transferFrom(msg.sender, address(this), amount));
        if (funds[fund].compoundEnabled) {
            mintCToken(address(token), address(cToken), amount);
            uint256 cTokenToAdd = div(mul(amount, WAD), cToken.exchangeRateCurrent());
            funds[fund].cBalance = add(funds[fund].cBalance, cTokenToAdd);
            if (!custom(fund)) { cTokenMarketLiquidity = add(cTokenMarketLiquidity, cTokenToAdd); }
        } else {
            funds[fund].balance = add(funds[fund].balance, amount);
            if (!custom(fund)) { tokenMarketLiquidity = add(tokenMarketLiquidity, amount); }
        }
        if (!custom(fund)) { calcGlobalInterest(); }
    }

    /**
     * @notice Users update Loan Fund settings
     * @param fund The Id of a Loan Fund
     * @param minLoanAmt_ Minimum amount of tokens that can be borrowed from Loan Fund
     * @param maxLoanAmt_ Maximum amount of tokens that can be borrowed from Loan Fund
     * @param minLoanDur_ Minimum length of loan that can be requested from Loan Fund in seconds
     * @param maxLoanDur_ Maximum length of loan that can be requested from Loan Fund in seconds
     * @param interest_ The interest rate per second for a Loan Fund in RAY per second
     * @param penalty_ The liquidation penalty rate per second for a Loan Fund in RAY per second
     * @param fee_ The optional automation fee rate of Loan Fund in RAY per second
     * @param liquidationRatio_ The liquidation ratio of Loan Fund in RAY
     * @param agent_ The address of the agent for a Loan fund
     *
     *        Note: msg.sender must be the lender of the Loan Fund
     */
    function update(
        bytes32  fund,
        uint256  minLoanAmt_,
        uint256  maxLoanAmt_,
        uint256  minLoanDur_,
        uint256  maxLoanDur_,
        uint256  interest_,
        uint256  penalty_,
        uint256  fee_,
        uint256  liquidationRatio_,
        address  agent_
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

    /**
     * @notice Borrowers request loan from Loan Fund
     * @param fund The Id of a Loan Fund
     * @param amount_ Amount of tokens to request
     * @param collateral_ Amount of collateral to deposit in satoshis
     * @param loanDur_ Length of loan request in seconds
     * @param secretHashes_ 4 secretHashes to be used in atomic loan process
     * @param pubKey_ Bitcoin public key to use for refunding collateral
     */
    function request(
        bytes32             fund,
        address             borrower_,
        uint256             amount_,
        uint256             collateral_,
        uint256             loanDur_,
        bytes32[4] calldata secretHashes_,
        bytes      calldata pubKey_
    ) external returns (bytes32 loanIndex) {
        require(msg.sender == lender(fund));
        require(amount_    <= balance(fund));
        require(amount_    >= minLoanAmt(fund));
        require(amount_    <= maxLoanAmt(fund));
        require(loanDur_   >= minLoanDur(fund));
        require(loanDur_   <= maxLoanDur(fund));

        loanIndex = createLoan(fund, borrower_, amount_, collateral_, loanDur_);
        loanSetSecretHashes(fund, loanIndex, secretHashes_, pubKey_);
        
        if (funds[fund].compoundEnabled) {
            uint256 cBalanceBefore = cToken.balanceOf(address(this));
            redeemUnderlying(address(cToken), amount_);
            uint256 cBalanceAfter = cToken.balanceOf(address(this));
            uint256 cTokenToRemove = sub(cBalanceBefore, cBalanceAfter);
            funds[fund].cBalance = sub(funds[fund].cBalance, cTokenToRemove);
            if (!custom(fund)) { cTokenMarketLiquidity = sub(cTokenMarketLiquidity, cTokenToRemove); }
        } else {
            funds[fund].balance = sub(funds[fund].balance, amount_);
            if (!custom(fund)) { tokenMarketLiquidity = sub(tokenMarketLiquidity, amount_); }
        }
        if (!custom(fund)) {
            totalBorrow = add(totalBorrow, amount_);
            calcGlobalInterest();
        }
        loans.fund(loanIndex);
    }

    function withdraw(bytes32 fund, uint256 amount) external { // Withdraw funds from Loan Fund
        require(msg.sender     == lender(fund));
        require(balance(fund)  >= amount);
        if (funds[fund].compoundEnabled) {
            uint256 cBalanceBefore = cToken.balanceOf(address(this));
            redeemUnderlying(address(cToken), amount);
            uint256 cBalanceAfter = cToken.balanceOf(address(this));
            uint256 cTokenToRemove = sub(cBalanceBefore, cBalanceAfter);
            funds[fund].cBalance = sub(funds[fund].cBalance, cTokenToRemove);
            require(token.transfer(lender(fund), amount));
            if (!custom(fund)) { cTokenMarketLiquidity = sub(cTokenMarketLiquidity, cTokenToRemove); }
        } else {
            funds[fund].balance = sub(funds[fund].balance, amount);
            require(token.transfer(lender(fund), amount));
            if (!custom(fund)) { tokenMarketLiquidity = sub(tokenMarketLiquidity, amount); }
        }
        if (!custom(fund)) { calcGlobalInterest(); }
    }

    function generate(bytes32[] calldata secretHashes_) external { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < secretHashes_.length; i++) {
            secretHashes[msg.sender].push(secretHashes_[i]);
        }
    }

    function setPubKey(bytes calldata pubKey) external { // Set PubKey for Fund
        pubKeys[msg.sender] = pubKey;
    }

    function enableCompound(bytes32 fund) external {
        require(compoundSet);
        require(funds[fund].compoundEnabled == false);
        require(msg.sender == lender(fund));
        uint256 cBalanceBefore = cToken.balanceOf(address(this));
        mintCToken(address(token), address(cToken), funds[fund].balance);
        uint256 cBalanceAfter = cToken.balanceOf(address(this));
        uint256 cTokenToReturn = sub(cBalanceAfter, cBalanceBefore);
        tokenMarketLiquidity = sub(tokenMarketLiquidity, funds[fund].balance);
        cTokenMarketLiquidity = add(cTokenMarketLiquidity, cTokenToReturn);
        funds[fund].compoundEnabled = true;
        funds[fund].balance = 0;
        funds[fund].cBalance = cTokenToReturn;
    }

    function disableCompound(bytes32 fund) external {
        require(funds[fund].compoundEnabled);
        require(msg.sender == lender(fund));
        uint256 balanceBefore = token.balanceOf(address(this));
        redeemCToken(address(cToken), funds[fund].cBalance);
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 tokenToReturn = sub(balanceAfter, balanceBefore);
        tokenMarketLiquidity = add(tokenMarketLiquidity, tokenToReturn);
        cTokenMarketLiquidity = sub(cTokenMarketLiquidity, funds[fund].cBalance);
        funds[fund].compoundEnabled = false;
        funds[fund].cBalance = 0;
        funds[fund].balance = tokenToReturn;
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

        marketLiquidity = add(tokenMarketLiquidity, wmul(cTokenMarketLiquidity, cToken.exchangeRateCurrent()));

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

    function calcInterest(uint256 amount, uint256 rate, uint256 loanDur) public pure returns (uint256) { // Calculate interest
        return sub(rmul(amount, rpow(rate, loanDur)), amount);
    }

    function createLoan(      // Private Loan Create
        bytes32  fund,        // Fund Index
        address  borrower_,
        uint256  amount_,     // Loan Amount
        uint256  collateral_, // Collateral Amount in satoshis
        uint256  loanDur_     // Loan Duration in seconds
    ) private returns (bytes32 loanIndex) {
        loanIndex = loans.create(
            now + loanDur_,
            [ borrower_, lender(fund), funds[fund].agent],
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
