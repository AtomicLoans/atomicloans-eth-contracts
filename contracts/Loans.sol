pragma solidity 0.5.10;

import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import {BytesLib} from "@summa-tx/bitcoin-spv-sol/contracts/BytesLib.sol";
import {BTCUtils} from "@summa-tx/bitcoin-spv-sol/contracts/BTCUtils.sol";

import './FundsInterface.sol';
import './SalesInterface.sol';
import './CollateralInterface.sol';
import './DSMath.sol';
import './Medianizer.sol';

contract Loans is DSMath {
    FundsInterface funds;
    Medianizer med;
    SalesInterface sales;
    CollateralInterface col;

    uint256 public constant APPROVE_EXP_THRESHOLD = 2 hours;    // approval expiration threshold
    uint256 public constant ACCEPT_EXP_THRESHOLD = 2 days;      // acceptance expiration threshold
    uint256 public constant LIQUIDATION_EXP_THRESHOLD = 7 days; // liquidation expiration threshold
    uint256 public constant SEIZURE_EXP_THRESHOLD = 2 days;     // seizable expiration threshold
    uint256 public constant LIQUIDATION_DISCOUNT = 930000000000000000; // 93% (7% discount)
    uint256 public constant MAX_NUM_LIQUIDATIONS = 3; // Maximum number of liquidations that can occur
    uint256 public constant MAX_UINT_256 = 2**256-1;

    mapping (bytes32 => Loan)                     public loans;
    mapping (bytes32 => PubKeys)                  public pubKeys;             // Bitcoin Public Keys
    mapping (bytes32 => SecretHashes)             public secretHashes;        // Secret Hashes
    mapping (bytes32 => Bools)                    public bools;               // Boolean state of Loan
    mapping (bytes32 => bytes32)                  public fundIndex;           // Mapping of Loan Index to Fund Index
    mapping (bytes32 => ERC20)                    public tokes;               // Mapping of Loan index to Token contract
    mapping (bytes32 => uint256)                  public repayments;          // Amount paid back in a Loan
    mapping (address => bytes32[])                public borrowerLoans;
    mapping (address => bytes32[])                public lenderLoans;
    mapping (address => mapping(uint256 => bool)) public addressToTimestamp;
    uint256                                       public loanIndex;           // Current Loan Index

    ERC20 public token; // ERC20 Debt Stablecoin
    uint256 public decimals;

    address deployer;

    /**
     * @notice Container for loan information
     * @member borrower The address of the borrower
     * @member lender The address of the lender
     * @member arbiter The address of the arbiter
     * @member createdAt The creation timestamp of the loan
     * @member loanExpiration The timestamp for the end of the loan
     * @member requestTimestamp The timestamp for when the loan is requested
     * @member closedTimestamp The timestamp for when the loan is closed
     * @member penalty The amount of tokens to be paid as a penalty for defaulting or allowing the loan to be liquidated
     * @member principal The amount of principal in tokens to be paid back at the end of the loan
     * @member interest The amount of interest in tokens to be paid back by the end of the loan
     * @member penalty The amount of tokens to be paid as a penalty for defaulting or allowing the loan to be liquidated
     * @member fee The amount of tokens paid to the arbiter
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
     *               reference for generating the correct P2WSH for
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

    function arbiter(bytes32 loan) public view returns (address) {
        return loans[loan].arbiter;
    }

    function approveExpiration(bytes32 loan) public view returns (uint256) { // Approval Expiration
        return add(loans[loan].createdAt, APPROVE_EXP_THRESHOLD);
    }

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
        return col.collateral(loan);
    }

    function refundableCollateral(bytes32 loan) public view returns (uint256) {
        return col.refundableCollateral(loan);
    }

    function seizableCollateral(bytes32 loan) public view returns (uint256) {
        return col.seizableCollateral(loan);
    }

    function temporaryRefundableCollateral(bytes32 loan) public view returns (uint256) {
        return col.temporaryRefundableCollateral(loan);
    }

    function temporarySeizableCollateral(bytes32 loan) public view returns (uint256) {
        return col.temporarySeizableCollateral(loan);
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

    function minSeizableCollateralValue(bytes32 loan) public view returns (uint256) {
        (bytes32 val, bool set) = med.peek();
        require(set, "Loans.minSeizableCollateralValue: Medianizer must be set");
        uint256 price = uint(val);
        return div(wdiv(dmul(owedForLoan(loan)), price), div(WAD, COL));
    }

    function collateralValue(bytes32 loan) public view returns (uint256) { // Current Collateral Value
        (bytes32 val, bool set) = med.peek();
        require(set, "Loans.collateralValue: Medianizer must be set");
        uint256 price = uint(val);
        return cmul(price, collateral(loan)); // Multiply value dependent on number of decimals with currency
    }

    function minCollateralValue(bytes32 loan) public view returns (uint256) {  // Minimum Collateral Value
        return rmul(dmul(sub(owedForLoan(loan), repaid(loan))), liquidationRatio(loan));
    }

    function discountCollateralValue(bytes32 loan) public view returns (uint256) {
        return wmul(collateralValue(loan), LIQUIDATION_DISCOUNT);
    }

    function safe(bytes32 loan) public view returns (bool) { // Loan is safe from Liquidation
        return collateralValue(loan) >= minCollateralValue(loan);
    }

    constructor (FundsInterface funds_, Medianizer med_, ERC20 token_, uint256 decimals_) public {
        require(address(funds_) != address(0), "Funds address must be non-zero");
        require(address(med_) != address(0), "Medianizer address must be non-zero");
        require(address(token_) != address(0), "Token address must be non-zero");

        deployer = msg.sender;
        funds = funds_;
        med = med_;
        token = token_;
        decimals = decimals_;
        require(token.approve(address(funds), MAX_UINT_256), "Token approve failed");
    }

    // NOTE: THE FOLLOWING FUNCTIONS CAN ONLY BE CALLED BY THE DEPLOYER OF THE
    //       CONTRACT ONCE. THIS IS TO ALLOW FOR FUNDS, LOANS, AND SALES
    //       CONTRACTS TO BE DEPLOYED SEPARATELY (DUE TO GAS LIMIT RESTRICTIONS).
    //       IF YOU ARE USING THIS CONTRACT, ENSURE THAT THESE FUNCTIONS HAVE
    //       ALREADY BEEN CALLED BEFORE DEPOSITING FUNDS.
    // ======================================================================

    /**
     * @dev Sets Sales contract
     * @param sales_ Address of Sales contract
     */
    function setSales(SalesInterface sales_) external {
        require(msg.sender == deployer, "Loans.setSales: Only the deployer can perform this");
        require(address(sales) == address(0), "Loans.setSales: The Sales address has already been set");
        require(address(sales_) != address(0), "Loans.setSales: Sales address must be non-zero");
        sales = sales_;
    }

    /**
     * @dev Sets Spv contract
     * @param col_ Address of Collateral contract
     */
    function setCollateral(CollateralInterface col_) external {
        require(msg.sender == deployer, "Loans.setCollateral: Only the deployer can perform this");
        require(address(col) == address(0), "Loans.setCollateral: The Collateral address has already been set");
        require(address(col_) != address(0), "Loans.setCollateral: Collateral address must be non-zero");
        col = col_;
    }
    // ======================================================================

    /**
     * @notice Creates a new loan agreement
     * @param loanExpiration_ The timestamp for the end of the loan
     * @param usrs_ Array of three addresses containing the borrower, lender, and optional arbiter address
     * @param vals_ Array of seven uints containing loan principal, interest, liquidation penalty, optional arbiter fee, collateral amount, liquidation ratio, and request timestamp
     * @param fundIndex_ The optional Fund Index
     */
    function create(
        uint256             loanExpiration_,
        address[3] calldata usrs_,
        uint256[7] calldata vals_,
        bytes32             fundIndex_
    ) external returns (bytes32 loan) {
        if (fundIndex_ != bytes32(0)) {
            require(funds.lender(fundIndex_) == usrs_[1], "Loans.create: Lender of Fund not in args");
        }
        require(!addressToTimestamp[usrs_[0]][vals_[6]], "Loans.create: Duplicate request timestamps are not allowed");
        require(loanExpiration_ > now, "Loans.create: loanExpiration must be greater than `now`");
        require(usrs_[0] != address(0) && usrs_[1] != address(0), "Loans.create: Borrower and Lender address must be non-zero");
        require(vals_[0] != 0 && vals_[4] != 0, "Loans.create: Principal and Collateral must be non-zero");
        require(vals_[5] != 0 && vals_[6] != 0, "Loans.create: Liquidation ratio and Request timestamp must be non-zero");

        loanIndex = add(loanIndex, 1);
        loan = bytes32(loanIndex);
        loans[loan].createdAt = now;
        loans[loan].loanExpiration = loanExpiration_;
        loans[loan].borrower = usrs_[0];
        loans[loan].lender = usrs_[1];
        loans[loan].arbiter = usrs_[2];
        loans[loan].principal = vals_[0];
        loans[loan].interest = vals_[1];
        loans[loan].penalty = vals_[2];
        loans[loan].fee = vals_[3];
        uint256 minSeizableCollateralVal = minSeizableCollateralValue(loan);
        col.setCollateral(loan, sub(vals_[4], minSeizableCollateralVal), minSeizableCollateralVal);
        loans[loan].liquidationRatio = vals_[5];
        loans[loan].requestTimestamp = vals_[6];
        fundIndex[loan] = fundIndex_;
        secretHashes[loan].set = false;
        borrowerLoans[usrs_[0]].push(bytes32(loanIndex));
        lenderLoans[usrs_[1]].push(bytes32(loanIndex));
        addressToTimestamp[usrs_[0]][vals_[6]] = true;

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
    ) external {
        require(!secretHashes[loan].set, "Loans.setSecretHashes: Secret hashes must not already be set");
        require(
            msg.sender == loans[loan].borrower || msg.sender == loans[loan].lender || msg.sender == address(funds),
            "Loans.setSecretHashes: msg.sender must be Borrower, Lender or Funds Address"
        );
        secretHashes[loan].secretHashA1 = borrowerSecretHashes[0];
        secretHashes[loan].secretHashAs = [ borrowerSecretHashes[1], borrowerSecretHashes[2], borrowerSecretHashes[3] ];
        secretHashes[loan].secretHashB1 = lenderSecretHashes[0];
        secretHashes[loan].secretHashBs = [ lenderSecretHashes[1], lenderSecretHashes[2], lenderSecretHashes[3] ];
        secretHashes[loan].secretHashC1 = arbiterSecretHashes[0];
        secretHashes[loan].secretHashCs = [ arbiterSecretHashes[1], arbiterSecretHashes[2], arbiterSecretHashes[3] ];
        pubKeys[loan].borrowerPubKey = borrowerPubKey_;
        pubKeys[loan].lenderPubKey = lenderPubKey_;
        pubKeys[loan].arbiterPubKey = arbiterPubKey_;
        secretHashes[loan].set = true;
    }

    /**
     * @notice Lender sends tokens to the loan agreement
     * @param loan The Id of the Loan
     */
    function fund(bytes32 loan) external {
        require(secretHashes[loan].set, "Loans.fund: Secret hashes must be set");
        require(bools[loan].funded == false, "Loans.fund: Loan is already funded");
        bools[loan].funded = true;
        require(token.transferFrom(msg.sender, address(this), principal(loan)), "Loans.fund: Failed to transfer tokens");
    }

    /**
     * @notice Lender approves locking of Bitcoin collateral
     * @param loan The Id of the Loan
     */
    function approve(bytes32 loan) external { // Approve locking of collateral
    	require(bools[loan].funded == true, "Loans.approve: Loan must be funded");
    	require(loans[loan].lender == msg.sender, "Loans.approve: Only the lender can approve the loan");
        require(now <= approveExpiration(loan), "Loans.approve: Loan is past the approve deadline");
    	bools[loan].approved = true;
    }

    /**
     * @notice Borrower withdraws loan
     * @param loan The Id of the Loan
     * @param secretA1 Secret A1 provided by the borrower
     */
    function withdraw(bytes32 loan, bytes32 secretA1) external {
        require(!off(loan), "Loans.withdraw: Loan cannot be inactive");
        require(bools[loan].funded == true, "Loans.withdraw: Loan must be funded");
        require(bools[loan].approved == true, "Loans.withdraw: Loan must be approved");
        require(bools[loan].withdrawn == false, "Loans.withdraw: Loan principal has already been withdrawn");
        require(sha256(abi.encodePacked(secretA1)) == secretHashes[loan].secretHashA1, "Loans.withdraw: Secret does not match");
        bools[loan].withdrawn = true;
        require(token.transfer(loans[loan].borrower, principal(loan)), "Loans.withdraw: Failed to transfer tokens");

        secretHashes[loan].withdrawSecret = secretA1;
        if (address(col.onDemandSpv()) != address(0)) {col.requestSpv(loan);}
    }

    /**
     * @notice Lender sends tokens to the loan agreement
     * @param loan The Id of the Loan
     * @param amount The amount of tokens to repay
     *
     *        Note: Anyone can repay the loan
     */
    function repay(bytes32 loan, uint256 amount) external {
        require(!off(loan), "Loans.repay: Loan cannot be inactive");
        require(!sale(loan), "Loans.repay: Loan cannot be undergoing a liquidation");
        require(bools[loan].withdrawn == true, "Loans.repay: Loan principal must be withdrawn");
        require(now <= loans[loan].loanExpiration, "Loans.repay: Loan cannot have expired");
        require(add(amount, repaid(loan)) <= owedForLoan(loan), "Loans.repay: Cannot repay more than the owed amount");
        require(token.transferFrom(msg.sender, address(this), amount), "Loans.repay: Failed to transfer tokens");
        repayments[loan] = add(amount, repayments[loan]);
        if (repaid(loan) == owedForLoan(loan)) {
            bools[loan].paid = true;
            if (address(col.onDemandSpv()) != address(0)) {col.cancelSpv(loan);}
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
        require(!off(loan), "Loans.refund: Loan cannot be inactive");
        require(!sale(loan), "Loans.refund: Loan cannot be undergoing a liquidation");
        require(now > acceptExpiration(loan), "Loans.refund: Cannot request refund until after acceptExpiration");
        require(bools[loan].paid == true, "Loans.refund: The loan must be repaid");
        require(msg.sender == loans[loan].borrower, "Loans.refund: Only the borrower can request a refund");
        bools[loan].off = true;
        loans[loan].closedTimestamp = now;
        if (funds.custom(fundIndex[loan]) == false) {
            funds.decreaseTotalBorrow(loans[loan].principal);
            funds.calcGlobalInterest();
        }
        require(token.transfer(loans[loan].borrower, owedForLoan(loan)), "Loans.refund: Failed to transfer tokens");
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

    function cancel(bytes32 loan) external {
        require(!off(loan), "Loans.cancel: Loan must not be inactive");
        require(bools[loan].withdrawn == false, "Loans.cancel: Loan principal must not be withdrawn");
        require(now >= seizureExpiration(loan), "Loans.cancel: Seizure deadline has not been reached");
        require(bools[loan].sale == false, "Loans.cancel: Loan must not be undergoing liquidation");
        close(loan);
    }

    /**
     * @notice Lender accepts loan repayment
     * @dev Lender accepts loan repayment and principal + interest are sent back to the Lender / Loan Fund
     * @param loan The Id of the Loan
     * @param secret Secret B1 revealed by the Lender
     */
    function accept(bytes32 loan, bytes32 secret) public {
        require(!off(loan), "Loans.accept: Loan must not be inactive");
        require(bools[loan].withdrawn == false || bools[loan].paid == true, "Loans.accept: Loan must be either not withdrawn or repaid");
        require(msg.sender == loans[loan].lender || msg.sender == loans[loan].arbiter, "Loans.accept: msg.sender must be lender or arbiter");
        require(now <= acceptExpiration(loan), "Loans.accept: Acceptance deadline has past");
        require(bools[loan].sale == false, "Loans.accept: Loan must not be going under liquidation");
        require(
            sha256(abi.encodePacked(secret)) == secretHashes[loan].secretHashB1 || sha256(abi.encodePacked(secret)) == secretHashes[loan].secretHashC1,
            "Loans.accept: Invalid secret"
        );
        secretHashes[loan].acceptSecret = secret;
        close(loan);
    }

    function close(bytes32 loan) private {
        bools[loan].off = true;
        loans[loan].closedTimestamp = now;
        if (bools[loan].withdrawn == false) {
            if (fundIndex[loan] == bytes32(0)) {
                require(token.transfer(loans[loan].lender, loans[loan].principal), "Loans.close: Failed to transfer principal to Lender");
            } else {
                if (funds.custom(fundIndex[loan]) == false) {
                    funds.decreaseTotalBorrow(loans[loan].principal);
                }
                funds.deposit(fundIndex[loan], loans[loan].principal);
            }
        } else {
            if (fundIndex[loan] == bytes32(0)) {
                require(token.transfer(loans[loan].lender, owedToLender(loan)), "Loans.close: Failed to transfer owedToLender to Lender");
            } else {
                if (funds.custom(fundIndex[loan]) == false) {
                    funds.decreaseTotalBorrow(loans[loan].principal);
                }
                funds.deposit(fundIndex[loan], owedToLender(loan));
            }
            require(token.transfer(loans[loan].arbiter, fee(loan)), "Loans.close: Failed to transfer fee to Arbiter");
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
        require(!off(loan), "Loans.liquidate: Loan must not be inactive");
        require(bools[loan].withdrawn == true, "Loans.liquidate: Loan principal must be withdrawn");
        require(msg.sender != loans[loan].borrower && msg.sender != loans[loan].lender, "Loans.liquidate: Liquidator must be a third-party");
        require(secretHash != bytes32(0) && pubKeyHash != bytes20(0), "Loans.liquidate: secretHash and pubKeyHash must be non-zero");
        if (sales.next(loan) == 0) {
            if (now > loans[loan].loanExpiration) {
                require(bools[loan].paid == false, "Loans.liquidate: loan must not have already been repaid");
            } else {
                require(!safe(loan), "Loans.liquidate: collateralization must be below min-collateralization ratio");
            }
            if (funds.custom(fundIndex[loan]) == false) {
                funds.decreaseTotalBorrow(loans[loan].principal);
                funds.calcGlobalInterest();
            }
        } else {
            require(sales.next(loan) < MAX_NUM_LIQUIDATIONS, "Loans.liquidate: Max number of liquidations reached");
            require(!sales.accepted(sales.saleIndexByLoan(loan, sales.next(loan) - 1)), "Loans.liquidate: Previous liquidation already accepted");
            require(
                now > sales.settlementExpiration(sales.saleIndexByLoan(loan, sales.next(loan) - 1)),
                "Loans.liquidate: Previous liquidation settlement expiration hasn't expired"
            );
        }
        require(token.balanceOf(msg.sender) >= ddiv(discountCollateralValue(loan)), "Loans.liquidate: insufficient balance to liquidate");
        require(token.transferFrom(msg.sender, address(sales), ddiv(discountCollateralValue(loan))), "Loans.liquidate: Token transfer failed");
        SecretHashes storage h = secretHashes[loan];
        uint256 i = sales.next(loan);
        sale_ = sales.create(
            loan, loans[loan].borrower, loans[loan].lender, loans[loan].arbiter, msg.sender,
            h.secretHashAs[i], h.secretHashBs[i], h.secretHashCs[i], secretHash, pubKeyHash
        );
        if (bools[loan].sale == false) {
            bools[loan].sale = true;
            require(token.transfer(address(sales), repaid(loan)), "Loans.liquidate: Token transfer to Sales contract failed");
        }
        if (address(col.onDemandSpv()) != address(0)) {col.cancelSpv(loan);}
    }
}
