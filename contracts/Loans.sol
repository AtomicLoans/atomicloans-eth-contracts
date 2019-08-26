import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Funds.sol';
import './Sales.sol';
import './DSMath.sol';
import './Medianizer.sol';

pragma solidity ^0.5.8;

contract Loans is DSMath {
    Funds funds;
    Medianizer med;
    Sales sales;

    uint256 public constant APPROVE_EXP_THRESHOLD = 7200;    // approval expiration threshold
    uint256 public constant ACCEPT_EXP_THRESHOLD = 172800;   // acceptance expiration threshold
    uint256 public constant LIQUIDATION_EXP_THRESHOLD = 604800;  // liquidation expiration threshold
    uint256 public constant SEIZURE_EXP_THRESHOLD = 172800;      // seizable expiration threshold
    uint256 public constant LIQUIDATION_DISCOUNT = 930000000000000000; // 93% (7% discount)

    mapping (bytes32 => Loan)         public loans;
    mapping (bytes32 => PubKeys)      public pubKeys;      // PubKeys
    mapping (bytes32 => SecretHashes) public secretHashes; // Secret Hashes
    mapping (bytes32 => Bools)        public bools;        // Boolean state of Loan
    mapping (bytes32 => bytes32)      public fundIndex;    // Mapping of Loan Index to Fund Index
    mapping (bytes32 => ERC20)        public tokes;        // Mapping of Loan index to Token contract
    mapping (bytes32 => uint256)      public repayments;   // Amount paid back in a Loan
    uint256                           public loanIndex;    // Current Loan Index

    ERC20 public token; // ERC20 Debt Stablecoin
    uint256 public decimals;

    address deployer;

    /**
     * @notice Container for loan information
     * @member borrower The address of the borrower
     * @member lender The address of the lender
     * @member agent The address of the agent
     * @member createAt The creation timestamp of the loan
     * @member loanExpiration The timestamp for the end of the loan
     * @member principal The amount of principal in tokens to be paid back at the end of the loan
     * @member interest The amount of interest in tokens to be paid back by the end of the loan
     * @member penalty The amount of tokens to be paid as a penalty for defaulting or allowing the loan to be liquidated
     * @member fee The amount of tokens paid to the agent
     * @member collateral The amount of collateral in satoshis
     * @member liquidationRatio The ratio of collateral to debt where the loan can be liquidated
     */
    struct Loan {
    	address borrower;         // Address Borrower
        address lender;           // Address Lender
        address agent;            // Optional Address automated agent
        uint256 createdAt;        // Created At
        uint256 loanExpiration;   // Loan Expiration
        uint256 principal;        // Principal
        uint256 interest;         // Interest
        uint256 penalty;          // Liquidation Penalty
        uint256 fee;              // Optional fee paid to auto if address not 0x0
        uint256 collateral;       // Collateral
        uint256 liquidationRatio; // Liquidation Ratio
    }

    struct PubKeys {
        bytes   borrowerPubKey;   // Borrower PubKey
        bytes   lenderPubKey;     // Lender PubKey
        bytes   agentPubKey;      // Agent PubKey
    }

    struct SecretHashes {
    	bytes32    secretHashA1;   // Secret Hash A1
    	bytes32[3] secretHashAs;   // Secret Hashes A2, A3, A4 (for Sales)
    	bytes32    secretHashB1;   // Secret Hash B1
    	bytes32[3] secretHashBs;   // Secret Hashes B2, B3, B4 (for Sales)
    	bytes32    secretHashC1;   // Secret Hash C1
    	bytes32[3] secretHashCs;   // Secret Hashes C2, C3, C4 (for Sales)
        bytes32    withdrawSecret; // Secret A1
        bytes32    acceptSecret;   // Secret B1 or Secret C1
    	bool       set;            // Secret Hashes set
    }

    struct Bools {
    	bool funded;        // Loan Funded
    	bool approved;      // Approve locking of collateral
    	bool withdrawn;     // Loan Withdrawn
    	bool sale;          // Collateral Liquidation Started
    	bool paid;          // Loan Repaid
    	bool off;           // Loan Finished (Repayment accepted or cancelled)
    }

    function borrower(bytes32 loan) public view returns (address) {
        return loans[loan].borrower;
    }

    function lender(bytes32 loan) public view returns (address) {
        return loans[loan].lender;
    }

    function agent(bytes32 loan)  public view returns (address) {
        return loans[loan].agent;
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

    function collateralValue(bytes32 loan) public view returns (uint256) { // Current Collateral Value
        uint256 val = uint(med.read());
        return cmul(val, collateral(loan)); // Multiply value dependent on number of decimals with currency
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

    constructor (Funds funds_, Medianizer med_, ERC20 token_, uint256 decimals_) public {
        deployer = msg.sender;
    	funds    = funds_;
    	med      = med_;
        token    = token_;
        decimals = decimals_;
        require(token.approve(address(funds), 2**256-1));
    }

    function setSales(Sales sales_) external {
        require(msg.sender == deployer);
        require(address(sales) == address(0));
        sales = sales_;
    }
    
    function create(                         // Create new Loan
        uint256             loanExpiration_, // Loan Expiration
        address[3] calldata usrs_,           // Borrower, Lender, Optional Automated Agent Addresses
        uint256[6] calldata vals_,           // Principal, Interest, Liquidation Penalty, Optional Automation Fee, Collaateral Amount, Liquidation Ratio
        bytes32             fundIndex_       // Optional Fund Index
    ) external returns (bytes32 loan) {
        if (fundIndex_ != bytes32(0)) { require(funds.lender(fundIndex_) == usrs_[1]); }
        loanIndex = add(loanIndex, 1);
        loan = bytes32(loanIndex);
        loans[loan].createdAt        = now;
        loans[loan].loanExpiration   = loanExpiration_;
        loans[loan].borrower         = usrs_[0];
        loans[loan].lender           = usrs_[1];
        loans[loan].agent            = usrs_[2];
        loans[loan].principal        = vals_[0];
        loans[loan].interest         = vals_[1];
        loans[loan].penalty          = vals_[2];
        loans[loan].fee              = vals_[3];
        loans[loan].collateral       = vals_[4];
        loans[loan].liquidationRatio = vals_[5];
        fundIndex[loan]              = fundIndex_;
        secretHashes[loan].set       = false;
    }

    function setSecretHashes(                     // Set Secret Hashes for Loan
    	bytes32             loan,                 // Loan index
        bytes32[4] calldata borrowerSecretHashes, // Borrower Secret Hashes
        bytes32[4] calldata lenderSecretHashes,   // Lender Secret Hashes
        bytes32[4] calldata agentSecretHashes,    // Agent Secret Hashes
		bytes      calldata borrowerPubKey_,      // Borrower Pubkey
        bytes      calldata lenderPubKey_,        // Lender Pubkey
        bytes      calldata agentPubKey_          // Agent Pubkey
	) external returns (bool) {
		require(!secretHashes[loan].set);
		require(msg.sender == loans[loan].borrower || msg.sender == loans[loan].lender || msg.sender == address(funds));
		secretHashes[loan].secretHashA1 = borrowerSecretHashes[0];
		secretHashes[loan].secretHashAs = [ borrowerSecretHashes[1], borrowerSecretHashes[2], borrowerSecretHashes[3] ];
		secretHashes[loan].secretHashB1 = lenderSecretHashes[0];
		secretHashes[loan].secretHashBs = [ lenderSecretHashes[1], lenderSecretHashes[2], lenderSecretHashes[3] ];
		secretHashes[loan].secretHashC1 = agentSecretHashes[0];
		secretHashes[loan].secretHashCs = [ agentSecretHashes[1], agentSecretHashes[2], agentSecretHashes[3] ];
		pubKeys[loan].borrowerPubKey    = borrowerPubKey_;
		pubKeys[loan].lenderPubKey      = lenderPubKey_;
        pubKeys[loan].agentPubKey       = agentPubKey_;
        secretHashes[loan].set          = true;
	}

	function fund(bytes32 loan) external { // Fund Loan
		require(secretHashes[loan].set);
    	require(bools[loan].funded == false);
    	require(token.transferFrom(msg.sender, address(this), principal(loan)));
    	bools[loan].funded = true;
    }

    function approve(bytes32 loan) external { // Approve locking of collateral
    	require(bools[loan].funded == true);
    	require(loans[loan].lender == msg.sender);
    	require(now                <= approveExpiration(loan));
    	bools[loan].approved = true;
    }

    function withdraw(bytes32 loan, bytes32 secretA1) external { // Withdraw
    	require(!off(loan));
    	require(bools[loan].funded == true);
    	require(bools[loan].approved == true);
    	require(sha256(abi.encodePacked(secretA1)) == secretHashes[loan].secretHashA1);
    	require(token.transfer(loans[loan].borrower, principal(loan)));
    	bools[loan].withdrawn = true;
        secretHashes[loan].withdrawSecret = secretA1;
    }

    function repay(bytes32 loan, uint256 amount) external { // Repay Loan
        // require(msg.sender                == loans[loan].borrower); // NOTE: this is not necessary. Anyone can pay off the loan
    	require(!off(loan));
        require(!sale(loan));
    	require(bools[loan].withdrawn     == true);
    	require(now                       <= loans[loan].loanExpiration);
    	require(add(amount, repaid(loan))    <= owedForLoan(loan));
    	require(token.transferFrom(msg.sender, address(this), amount));
    	repayments[loan] = add(amount, repayments[loan]);
    	if (repaid(loan) == owedForLoan(loan)) {
    		bools[loan].paid = true;
    	}
    }

    function refund(bytes32 loan) external { // Refund payback
    	require(!off(loan));
        require(!sale(loan));
    	require(now              >  acceptExpiration(loan));
    	require(bools[loan].paid == true);
    	require(msg.sender       == loans[loan].borrower);
        bools[loan].off = true;
    	require(token.transfer(loans[loan].borrower, owedForLoan(loan)));
        if (funds.custom(fundIndex[loan]) == false) {
            funds.decreaseTotalBorrow(loans[loan].principal);
            funds.calcGlobalInterest();
        }
    }

    function cancel(bytes32 loan, bytes32 secret) external {
        accept(loan, secret); // Default to true for returning funds to Fund
    }

    function accept(bytes32 loan, bytes32 secret) public { // Accept or Cancel // Bool fund set true if lender wants fund to return to fund
        require(!off(loan));
        require(bools[loan].withdrawn == false   || bools[loan].paid == true);
        require(msg.sender == loans[loan].lender || msg.sender == loans[loan].agent);
        require(sha256(abi.encodePacked(secret)) == secretHashes[loan].secretHashB1 || sha256(abi.encodePacked(secret)) == secretHashes[loan].secretHashC1);
        require(now                              <= acceptExpiration(loan));
        require(bools[loan].sale                 == false);
        bools[loan].off = true;
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
            require(token.transfer(loans[loan].agent, fee(loan)));
        }
    }

    function liquidate(bytes32 loan, bytes32 secretHash, bytes20 pubKeyHash) external returns (bytes32 sale_) { // Start Liquidation
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
		sale_ = sales.create(loan, loans[loan].borrower, loans[loan].lender, loans[loan].agent, msg.sender, h.secretHashAs[i], h.secretHashBs[i], h.secretHashCs[i], secretHash, pubKeyHash);
        if (bools[loan].sale == false) { require(token.transfer(address(sales), repaid(loan))); }
		bools[loan].sale = true;
    }
}
