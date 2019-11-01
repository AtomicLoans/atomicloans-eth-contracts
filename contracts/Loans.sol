import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './FundsInterface.sol';
import './SalesInterface.sol';
import './DSMath.sol';
import './Medianizer.sol';

pragma solidity ^0.5.8;

contract Loans is DSMath {
    FundsInterface funds;
    Medianizer med;
    SalesInterface sales;

    uint256 public constant APPROVE_EXP_THRESHOLD = 2 hours;    // approval expiration threshold
    uint256 public constant ACCEPT_EXP_THRESHOLD = 2 days;      // acceptance expiration threshold
    uint256 public constant LIQUIDATION_EXP_THRESHOLD = 7 days; // liquidation expiration threshold
    uint256 public constant SEIZURE_EXP_THRESHOLD = 2 days;     // seizable expiration threshold
    uint256 public constant LIQUIDATION_DISCOUNT = 930000000000000000; // 93% (7% discount)

    mapping (bytes32 => Loan)         public loans;
    mapping (bytes32 => PubKeys)      public pubKeys;      // PubKeys
    mapping (bytes32 => SecretHashes) public secretHashes; // Secret Hashes
    mapping (bytes32 => Bools)        public bools;        // Boolean state of Loan
    mapping (bytes32 => bytes32)      public fundIndex;    // Mapping of Loan Index to Fund Index
    mapping (bytes32 => ERC20)        public tokes;        // Mapping of Loan index to Token contract
    mapping (bytes32 => uint256)      public repayments;   // Amount paid back in a Loan
    uint256                           public loanIndex;    // Current Loan Index

    mapping (address => bytes32[])    public borrowerLoans;
    mapping (address => bytes32[])    public lenderLoans;

    ERC20 public token; // ERC20 Debt Stablecoin
    uint256 public decimals;

    address deployer;

    /**
     * @notice Container for loan information
     * @member borrower The address of the borrower
     * @member lender The address of the lender
     * @member arbiter The address of the arbiter
     * @member createAt The creation timestamp of the loan
     * @member loanExpiration The timestamp for the end of the loan
     * @member principal The amount of principal in tokens to be paid back at the end of the loan
     * @member interest The amount of interest in tokens to be paid back by the end of the loan
     * @member penalty The amount of tokens to be paid as a penalty for defaulting or allowing the loan to be liquidated
     * @member fee The amount of tokens paid to the arbiter
     * @member collateral The amount of collateral in satoshis
     * @member liquidationRatio The ratio of collateral to debt where the loan can be liquidated
     */
    struct Loan {
    	address borrower;
        address lender;
        address arbiter;
        uint256 createdAt;
        uint256 loanExpiration;
        uint256 requestTimestamp;
        uint256 closedTimestamp;
        uint256 principal;
        uint256 interest;
        uint256 penalty;
        uint256 fee;
        uint256 collateral;
        uint256 liquidationRatio;
    }

    /**
     * @notice Container for Bitcoin public key information
     * @member borrowerPubKey Borrower Bitcoin Public Key
     * @member lenderPubKey Lender Bitcoin Public Key
     * @member arbiterPubKey Arbiter Bitcoin Public Key
     *
     *         Note: This struct is unnecessary for the Ethereum
     *               contract itself, but is used as a point of 
     *               reference for generating the correct P2SH for
     *               locking Bitcoin collateral
     */
    struct PubKeys {
        bytes   borrowerPubKey;
        bytes   lenderPubKey;
        bytes   arbiterPubKey;
    }

    /**
     * @notice Container for borrower, lender, and arbiter Secret Hashes
     * @member secretHashA1 Borrower Secret Hash for the loan
     * @member secretHashAs Borrower Secret Hashes for up to three liquidations
     * @member secretHashB1 Lender Secret Hash for the loan
     * @member secretHashBs Lender Secret Hashes for up to three liquidations
     * @member secretHashC1 Arbiter Secret Hash for the loan
     * @member secretHashCs Arbiter Secret Hashes for up to three liquidations
     * @member withdrawSecret Secret A1 when revealed by borrower
     * @member acceptSecret Secret B1 or Secret C1 when revelaed by the lender or arbiter
     * @member set Secret Hashes set for particular loan
     */
    struct SecretHashes {
    	bytes32    secretHashA1;
    	bytes32[3] secretHashAs;
    	bytes32    secretHashB1;
    	bytes32[3] secretHashBs;
    	bytes32    secretHashC1;
    	bytes32[3] secretHashCs;
        bytes32    withdrawSecret;
        bytes32    acceptSecret;
    	bool       set;
    }

    /**
     * @notice Container for states of loan agreement
     * @member funded Indicates that the loan has been funded with tokens
     * @member approved Indicates that the lender has approved locking of the Bitcoin collateral
     * @member withdrawn Indicates that the borrower has withdrawn the tokens from the contract
     * @member sale Indicates that the collateral liquidation process has started
     * @member paid Indicates that the loan has been repaid
     * @member off Indicates that the loan has been cancelled or the loan repayment has been accepted
     */
    struct Bools {
    	bool funded;
    	bool approved;
    	bool withdrawn;
    	bool sale;
    	bool paid;
    	bool off;
    }

    event Create(bytes32 loan);

    function borrower(bytes32 loan) public view returns (address) {
        return loans[loan].borrower;
    }

    function lender(bytes32 loan) public view returns (address) {
        return loans[loan].lender;
    }

    function arbiter(bytes32 loan)  public view returns (address) {
        return loans[loan].arbiter;
    }

    function approveExpiration(bytes32 loan) public view returns (uint256) { // Approval Expiration
        return add(loans[loan].createdAt, APPROVE_EXP_THRESHOLD);
    }

    // TODO: add loanExpiration

    function acceptExpiration(bytes32 loan) public view returns (uint256) { // Acceptance Expiration
        return add(loans[loan].loanExpiration, ACCEPT_EXP_THRESHOLD);
    }

    function liquidationExpiration(bytes32 loan) public view returns (uint256) { // Liquidation Expiration
        return add(loans[loan].loanExpiration, LIQUIDATION_EXP_THRESHOLD);
    }

    function seizureExpiration(bytes32 loan) public view returns (uint256) {
        return add(liquidationExpiration(loan), SEIZURE_EXP_THRESHOLD);
    }

    function principal(bytes32 loan) public view returns (uint256) {
        return loans[loan].principal;
    }

    function interest(bytes32 loan) public view returns (uint256) {
        return loans[loan].interest;
    }

    function fee(bytes32 loan) public view returns (uint256) {
        return loans[loan].fee;
    }

    function penalty(bytes32 loan) public view returns (uint256) {
        return loans[loan].penalty;
    }

    function collateral(bytes32 loan) public view returns (uint256) {
        return loans[loan].collateral;
    }

    function repaid(bytes32 loan) public view returns (uint256) { // Amount paid back for loan
        return repayments[loan];
    }

    function liquidationRatio(bytes32 loan) public view returns (uint256) {
        return loans[loan].liquidationRatio;
    }

    function owedToLender(bytes32 loan) public view returns (uint256) { // Amount lent by Lender
        return add(principal(loan), interest(loan));
    }

    function owedForLoan(bytes32 loan) public view returns (uint256) { // Amount owed
        return add(owedToLender(loan), fee(loan));
    }

    function owedForLiquidation(bytes32 loan) public view returns (uint256) { // Deductible amount from collateral
        return add(owedForLoan(loan), penalty(loan));
    }

    function owing(bytes32 loan) public view returns (uint256) {
        return sub(owedForLoan(loan), repaid(loan));
    }

    function funded(bytes32 loan) public view returns (bool) {
        return bools[loan].funded;
    }

    function approved(bytes32 loan) public view returns (bool) {
        return bools[loan].approved;
    }

    function withdrawn(bytes32 loan) public view returns (bool) {
        return bools[loan].withdrawn;
    }

    function sale(bytes32 loan) public view returns (bool) {
        return bools[loan].sale;
    }

    function paid(bytes32 loan) public view returns (bool) {
        return bools[loan].paid;
    }

    function off(bytes32 loan) public view returns (bool) {
        return bools[loan].off;
    }

    function dmul(uint x) public view returns (uint256) {
        return mul(x, (10 ** sub(18, decimals)));
    }

    function ddiv(uint x) public view returns (uint256) {
        return div(x, (10 ** sub(18, decimals)));
    }

    function borrowerLoanCount(address borrower_) public view returns (uint256) {
        return borrowerLoans[borrower_].length;
    }

    function lenderLoanCount(address lender_) public view returns (uint256) {
        return lenderLoans[lender_].length;
    }

    function collateralValue(bytes32 loan) public view returns (uint256) { // Current Collateral Value
        (bytes32 val, bool set) = med.peek();
        require(set);
        uint256 price = uint(val);
        return cmul(price, collateral(loan)); // Multiply value dependent on number of decimals with currency
    }

    function minCollateralValue(bytes32 loan) public view returns (uint256) {  // Minimum Collateral Value
        return rmul(dmul(sub(principal(loan), repaid(loan))), liquidationRatio(loan));
    }

    function discountCollateralValue(bytes32 loan) public view returns (uint256) {
        return wmul(collateralValue(loan), LIQUIDATION_DISCOUNT);
    }

    function safe(bytes32 loan) public view returns (bool) { // Loan is safe from Liquidation
        return collateralValue(loan) >= minCollateralValue(loan);
    }

    constructor (FundsInterface funds_, Medianizer med_, ERC20 token_, uint256 decimals_) public {
        deployer = msg.sender;
    	funds    = funds_;
    	med      = med_;
        token    = token_;
        decimals = decimals_;
        require(token.approve(address(funds), 2**256-1));
    }

    /**
     * @dev Sets Sales contract
     * @param sales_ Address of Sales contract
     */
    function setSales(SalesInterface sales_) external {
        require(msg.sender == deployer);
        require(address(sales) == address(0));
        sales = sales_;
    }
    
    /**
     * @notice Creates a new loan agreement
     * @param loanExpiration_ The timestamp for the end of the loan
     * @param usrs_ Array of three addresses containing the borrower, lender, and optional arbiter address
     * @param vals_ Array of six uints containing loan principal, interest, liquidation penalty, optional arbiter fee, collateral amount, liquidation ratio
     * @param fundIndex_ The optional Fund Index
     */
    function create(
        uint256             loanExpiration_,
        address[3] calldata usrs_,
        uint256[7] calldata vals_,
        bytes32             fundIndex_
    ) external returns (bytes32 loan) {
        if (fundIndex_ != bytes32(0)) { require(funds.lender(fundIndex_) == usrs_[1]); }
        loanIndex = add(loanIndex, 1);
        loan = bytes32(loanIndex);
        loans[loan].createdAt        = now;
        loans[loan].loanExpiration   = loanExpiration_;
        loans[loan].borrower         = usrs_[0];
        loans[loan].lender           = usrs_[1];
        loans[loan].arbiter          = usrs_[2];
        loans[loan].principal        = vals_[0];
        loans[loan].interest         = vals_[1];
        loans[loan].penalty          = vals_[2];
        loans[loan].fee              = vals_[3];
        loans[loan].collateral       = vals_[4];
        loans[loan].liquidationRatio = vals_[5];
        loans[loan].requestTimestamp = vals_[6];
        fundIndex[loan]              = fundIndex_;
        secretHashes[loan].set       = false;
        borrowerLoans[usrs_[0]].push(bytes32(loanIndex));
        lenderLoans[usrs_[1]].push(bytes32(loanIndex));

        emit Create(loan);
    }

    /**
     * @notice Set Secret Hashes for loan agreement
     * @param loan The Id of the Loan
     * @param borrowerSecretHashes Borrower secret hashes
     * @param lenderSecretHashes Lender secret hashes
     * @param arbiterSecretHashes Arbiter secret hashes
     * @param borrowerPubKey_ Borrower Bitcoin Public Key
     * @param lenderPubKey_ Lender Bitcoin Public Key
     * @param arbiterPubKey_ Arbiter Bitcoin Public Key
     */
    function setSecretHashes(
    	bytes32             loan,
        bytes32[4] calldata borrowerSecretHashes,
        bytes32[4] calldata lenderSecretHashes,
        bytes32[4] calldata arbiterSecretHashes,
		bytes      calldata borrowerPubKey_,
        bytes      calldata lenderPubKey_,
        bytes      calldata arbiterPubKey_
	) external returns (bool) {
		require(!secretHashes[loan].set);
		require(msg.sender == loans[loan].borrower || msg.sender == loans[loan].lender || msg.sender == address(funds));
		secretHashes[loan].secretHashA1 = borrowerSecretHashes[0];
		secretHashes[loan].secretHashAs = [ borrowerSecretHashes[1], borrowerSecretHashes[2], borrowerSecretHashes[3] ];
		secretHashes[loan].secretHashB1 = lenderSecretHashes[0];
		secretHashes[loan].secretHashBs = [ lenderSecretHashes[1], lenderSecretHashes[2], lenderSecretHashes[3] ];
		secretHashes[loan].secretHashC1 = arbiterSecretHashes[0];
		secretHashes[loan].secretHashCs = [ arbiterSecretHashes[1], arbiterSecretHashes[2], arbiterSecretHashes[3] ];
		pubKeys[loan].borrowerPubKey    = borrowerPubKey_;
		pubKeys[loan].lenderPubKey      = lenderPubKey_;
        pubKeys[loan].arbiterPubKey       = arbiterPubKey_;
        secretHashes[loan].set          = true;
	}

    /**
     * @notice Lender sends tokens to the loan agreement
     * @param loan The Id of the Loan
     */
	function fund(bytes32 loan) external {
		require(secretHashes[loan].set);
    	require(bools[loan].funded == false);
    	require(token.transferFrom(msg.sender, address(this), principal(loan)));
    	bools[loan].funded = true;
    }

    /**
     * @notice Lender approves locking of Bitcoin collateral
     * @param loan The Id of the Loan
     */
    function approve(bytes32 loan) external { // Approve locking of collateral
    	require(bools[loan].funded == true);
    	require(loans[loan].lender == msg.sender);
    	require(now                <= approveExpiration(loan));
    	bools[loan].approved = true;
    }

    /**
     * @notice Borrower withdraws loan
     * @param loan The Id of the Loan
     * @param secretA1 Secret A1 provided by the borrower
     */
    function withdraw(bytes32 loan, bytes32 secretA1) external {
    	require(!off(loan));
    	require(bools[loan].funded == true);
    	require(bools[loan].approved == true);
        require(bools[loan].withdrawn == false);
    	require(sha256(abi.encodePacked(secretA1)) == secretHashes[loan].secretHashA1);
    	require(token.transfer(loans[loan].borrower, principal(loan)));
    	bools[loan].withdrawn = true;
        secretHashes[loan].withdrawSecret = secretA1;
    }

    /**
     * @notice Lender sends tokens to the loan agreement
     * @param loan The Id of the Loan
     * @param amount The amount of tokens to repay
     *
     *        Note: Anyone can repay the loan
     */
    function repay(bytes32 loan, uint256 amount) external {
    	require(!off(loan));
        require(!sale(loan));
    	require(bools[loan].withdrawn     == true);
    	require(now                       <= loans[loan].loanExpiration);
        require(add(amount, repaid(loan)) <= owedForLoan(loan));
    	require(token.transferFrom(msg.sender, address(this), amount));
    	repayments[loan] = add(amount, repayments[loan]);
    	if (repaid(loan) == owedForLoan(loan)) {
    		bools[loan].paid = true;
    	}
    }

    /**
     * @notice Borrower refunds tokens in the case that Lender doesn't accept loan repayment
     * @dev Send tokens back to the Borrower, and close Loan
     * @param loan The Id of the Loan
     *
     *        Note: If Lender does not accept repayment, liquidation cannot occur
     */
    function refund(bytes32 loan) external {
    	require(!off(loan));
        require(!sale(loan));
    	require(now              >  acceptExpiration(loan));
    	require(bools[loan].paid == true);
    	require(msg.sender       == loans[loan].borrower);
        bools[loan].off = true;
        loans[loan].closedTimestamp = now;
    	require(token.transfer(loans[loan].borrower, owedForLoan(loan)));
        if (funds.custom(fundIndex[loan]) == false) {
            funds.decreaseTotalBorrow(loans[loan].principal);
            funds.calcGlobalInterest();
        }
    }

    /**
     * @notice Lender cancels loan after Borrower locks collateral
     * @dev Lender cancels loan and principal is sent back to the Lender / Loan Fund
     * @param loan The Id of the Loan
     * @param secret Secret B1 revealed by the Lender
     */
    function cancel(bytes32 loan, bytes32 secret) external {
        accept(loan, secret);
    }

    /**
     * @notice Lender accepts loan repayment
     * @dev Lender accepts loan repayment and principal + interest are sent back to the Lender / Loan Fund
     * @param loan The Id of the Loan
     * @param secret Secret B1 revealed by the Lender
     */
    function accept(bytes32 loan, bytes32 secret) public {
        require(!off(loan));
        require(bools[loan].withdrawn == false   || bools[loan].paid == true);
        require(msg.sender == loans[loan].lender || msg.sender == loans[loan].arbiter);
        require(sha256(abi.encodePacked(secret)) == secretHashes[loan].secretHashB1 || sha256(abi.encodePacked(secret)) == secretHashes[loan].secretHashC1);
        require(now                              <= acceptExpiration(loan));
        require(bools[loan].sale                 == false);
        bools[loan].off = true;
        loans[loan].closedTimestamp = now;
        secretHashes[loan].acceptSecret = secret;
        if (bools[loan].withdrawn == false) {
            if (fundIndex[loan] == bytes32(0)) {
                require(token.transfer(loans[loan].lender, loans[loan].principal));
            } else {
                if (funds.custom(fundIndex[loan]) == false) {
                    funds.decreaseTotalBorrow(loans[loan].principal);
                }
                funds.deposit(fundIndex[loan], loans[loan].principal);
            }
        } else if (bools[loan].withdrawn == true) {
            if (fundIndex[loan] == bytes32(0)) {
                require(token.transfer(loans[loan].lender, owedToLender(loan)));
            } else {
                if (funds.custom(fundIndex[loan]) == false) {
                    funds.decreaseTotalBorrow(loans[loan].principal);
                }
                funds.deposit(fundIndex[loan], owedToLender(loan));
            }
            require(token.transfer(loans[loan].arbiter, fee(loan)));
        }
    }

    /**
     * @notice Any third party starts liquidation of the Bitcoin collateral by providing tokens with the intention to buy at a discount
     * @param loan The Id of the Loan
     * @param secretHash The Secret Hash D1 provided by the liquidator
     * @param pubKeyHash The Bitcoin Public Key Hash of the liquidator
     * @return sale_ The Id of the Sale (Liquidation)
     */
    function liquidate(bytes32 loan, bytes32 secretHash, bytes20 pubKeyHash) external returns (bytes32 sale_) {
    	require(!off(loan));
        require(bools[loan].withdrawn == true);
        require(msg.sender != loans[loan].borrower && msg.sender != loans[loan].lender);
    	if (sales.next(loan) == 0) {
    		if (now > loans[loan].loanExpiration) {
	    		require(bools[loan].paid == false);
			} else {
				require(!safe(loan));
			}
            if (funds.custom(fundIndex[loan]) == false) {
                funds.decreaseTotalBorrow(loans[loan].principal);
                funds.calcGlobalInterest();
            }
		} else {
			require(sales.next(loan) < 3);
            require(now > sales.settlementExpiration(sales.saleIndexByLoan(loan, sales.next(loan) - 1))); // Can only start liquidation after settlement expiration of pervious liquidation
            require(!sales.accepted(sales.saleIndexByLoan(loan, sales.next(loan) - 1))); // Can only start liquidation again if previous liquidation discountBuy wasn't taken
		}
        require(token.balanceOf(msg.sender) >= ddiv(discountCollateralValue(loan)));
        require(token.transferFrom(msg.sender, address(sales), ddiv(discountCollateralValue(loan))));
        SecretHashes storage h = secretHashes[loan];
        uint256 i = sales.next(loan);
		sale_ = sales.create(loan, loans[loan].borrower, loans[loan].lender, loans[loan].arbiter, msg.sender, h.secretHashAs[i], h.secretHashBs[i], h.secretHashCs[i], secretHash, pubKeyHash);
        if (bools[loan].sale == false) { require(token.transfer(address(sales), repaid(loan))); }
		bools[loan].sale = true;
    }
}
