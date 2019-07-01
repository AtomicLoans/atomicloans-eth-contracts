import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Funds.sol';
import './Sales.sol';
import './DSMath.sol';
import './Medianizer.sol';
import './Currency.sol';
import './Vars.sol';

pragma solidity ^0.5.8;

contract Loans is DSMath {
    Funds funds;
    Medianizer med;
    Sales sales;

    mapping (bytes32 => Loan)      public loans;
    mapping (bytes32 => Sechs)     public sechs;  // Secret Hashes
    mapping (bytes32 => Bools)     public bools;  // Boolean state of Loan
    mapping (bytes32 => bytes32)   public fundi;  // Mapping of Loan Index to Fund Index
    mapping (bytes32 => ERC20)     public tokes;  // Mapping of Loan index to Token contract
    mapping (bytes32 => Currency)  public cures;  // Mapping of Loan index to Currency contract
    mapping (bytes32 => Vars)      public vares;  // Mapping of Loan index to Vars contract
    mapping (bytes32 => uint256)   public backs;  // Amount paid back in a Loan
    mapping (bytes32 => uint256)   public asaex;  // All Auction expiration
    uint256                        public loani;  // Current Loan Index

    mapping (address => bool)      public tokas;  // Is ERC20 Token Approved

    bool on; // Ensure that Sales contract is created

    struct Loan {
    	address bor;        // Address Borrower
        address lend;       // Address Lender
        address agent;      // Optional Address automated agent
        uint256 born;       // Created At
        uint256 loex;       // Loan Expiration
        uint256 prin;       // Principal
        uint256 lint;       // Interest
        uint256 lpen;       // Liquidation Penalty
        uint256 lfee;       // Optional fee paid to auto if address not 0x0
        uint256 col;        // Collateral
        uint256 rat;        // Liquidation Ratio
        bytes   bpubk;      // Borrower PubKey
        bytes   lpubk;      // Lender PubKey
    }

    struct Sechs {
    	bytes32    sechA1;  // Secret Hash A1
    	bytes32[3] sechAS;  // Secret Hashes A2, A3, A4
    	bytes32    sechB1;  // Secret Hash B1
    	bytes32[3] sechBS;  // Secret Hashes B2, B3, B4
    	bytes32    sechC1;  // Secret Hash C1
    	bytes32[3] sechCS;  // Secret Hashes C2, C3, C4
    	bool       set;     // Secret Hashes set
    }

    struct Bools {
    	bool pushed;        // Loan Funded
    	bool marked;        // Collateral Marked as Locked
    	bool taken;         // Loan Withdrawn
    	bool sale;          // Collateral Liquidation Started
    	bool paid;          // Loan Repaid
    	bool off;           // Loan Finished (Repayment accepted or cancelled)
    }

    function bor(bytes32 loan)    public view returns (address) {
        return loans[loan].bor;
    }

    function lend(bytes32 loan)   public view returns (address) {
        return loans[loan].lend;
    }

    function agent(bytes32 loan)  public view returns (address) {
        return loans[loan].agent;
    }

    function apex(bytes32 loan)   public returns (uint256) { // Approval Expiration
        return add(loans[loan].born, vares[loan].APEXT());
    }

    function acex(bytes32 loan)   public returns (uint256) { // Acceptance Expiration
        return add(loans[loan].loex, vares[loan].ACEXT());
    }

    function biex(bytes32 loan)   public returns (uint256) { // Bidding Expiration
        return add(loans[loan].loex, vares[loan].BIEXT());
    }

    function prin(bytes32 loan)   public view returns (uint256) {
        return loans[loan].prin;
    }

    function lint(bytes32 loan)   public view returns (uint256) {
        return loans[loan].lint;
    }

    function lfee(bytes32 loan)   public view returns (uint256) {
        return loans[loan].lfee;
    }

    function lpen(bytes32 loan)   public view returns (uint256) {
        return loans[loan].lpen;
    }

    function col(bytes32 loan)    public view returns (uint256) {
        return loans[loan].col;
    }

    function back(bytes32 loan)   public view returns (uint256) { // Amount paid back for loan
        return backs[loan];
    }

    function rat(bytes32 loan)    public view returns (uint256) {
        return loans[loan].rat;
    }

    function pushed(bytes32 loan) public view returns (bool) {
        return bools[loan].pushed;
    }

    function lent(bytes32 loan)   public view returns (uint256) { // Amount lent by Lender
        return add(prin(loan), lint(loan));
    }

    function owed(bytes32 loan)   public view returns (uint256) { // Amount owed
        return add(lent(loan), lfee(loan));
    }

    function dedu(bytes32 loan)   public view returns (uint256) { // Deductible amount from collateral
        return add(owed(loan), lpen(loan));
    }

    function off(bytes32 loan)    public view returns (bool) {
        return bools[loan].off;
    }

    function colv(bytes32 loan) public returns (uint256) { // Current Collateral Value
        uint256 val = uint(med.read());
        return cures[loan].cmul(val, col(loan)); // Multiply value dependent on number of decimals with currency
    }

    function min(bytes32 loan) public view returns (uint256) {  // Minimum Collateral Value
        return rmul(sub(prin(loan), back(loan)), rat(loan));
    }

    function safe(bytes32 loan) public returns (bool) { // Loan is safe from Liquidation
        return colv(loan) >= min(loan);
    }

    constructor (address funds_, address med_) public {
    	funds = Funds(funds_);
    	med   = Medianizer(med_);
    }

    function setSales(address sales_) public {
        require(!on);
        sales = Sales(sales_);
        on = true;
    }
    
    function open(                  // Create new Loan
        uint256            loex_,   // Loan Expiration
        address[3] memory  usrs_,   // Borrower, Lender, Optional Automated Agent Addresses
        uint256[6] memory  vals_,   // Principal, Interest, Liquidation Penalty, Optional Automation Fee, Collaateral Amount, Liquidation Ratio
        ERC20              tok_,    // Token contract
        Currency           cur_,    // Currency contract
        Vars               vars_,   // Variable contract
        bytes32            fundi_   // Optional Fund Index
    ) public returns (bytes32 loan) {
        loani = add(loani, 1);
        loan = bytes32(loani);
        loans[loan].born   = now;
        loans[loan].loex   = loex_;
        loans[loan].bor    = usrs_[0];
        loans[loan].lend   = usrs_[1];
        loans[loan].agent  = usrs_[2];
        loans[loan].prin   = vals_[0];
        loans[loan].lint   = vals_[1];
        loans[loan].lpen   = vals_[2];
        loans[loan].lfee   = vals_[3];
        loans[loan].col    = vals_[4];
        loans[loan].rat    = vals_[5];
        tokes[loan]        = tok_;
        cures[loan]        = cur_;
        vares[loan]        = vars_;
        fundi[loan]        = fundi_;
        sechs[loan].set    = false;

        if (fundi_ != bytes32(0) && tokas[address(tok_)] == false) {
            tok_.approve(address(funds), 2**256-1);
            tokas[address(tok_)] = true;
        }
    }

    function setSechs(             // Set Secret Hashes for Loan
    	bytes32           loan,    // Loan index
    	bytes32[4] memory bsechs,  // Borrower Secret Hashes
    	bytes32[4] memory lsechs,  // Lender Secret Hashes
    	bytes32[4] memory asechs,  // Agent Secret Hashes
		bytes      memory bpubk_,  // Borrower Pubkey
        bytes      memory lpubk_   // Lender Pubkey
	) public returns (bool) {
		require(!sechs[loan].set);
		require(msg.sender == loans[loan].bor || msg.sender == loans[loan].lend || msg.sender == address(funds));
		sechs[loan].sechA1 = bsechs[0];
		sechs[loan].sechAS = [ bsechs[0], bsechs[1], bsechs[2] ];
		sechs[loan].sechB1 = lsechs[0];
		sechs[loan].sechBS = [ lsechs[0], lsechs[1], lsechs[2] ];
		sechs[loan].sechC1 = asechs[0];
		sechs[loan].sechCS = [ asechs[0], asechs[1], asechs[2] ];
		loans[loan].bpubk  = bpubk_;
		loans[loan].lpubk  = lpubk_;
        sechs[loan].set    = true;
	}

	function push(bytes32 loan) public { // Fund Loan
		require(sechs[loan].set);
    	require(bools[loan].pushed == false);
    	tokes[loan].transferFrom(msg.sender, address(this), prin(loan));
    	bools[loan].pushed = true;
    }

    function mark(bytes32 loan) public { // Mark Collateral as locked
    	require(bools[loan].pushed == true);
    	require(loans[loan].lend   == msg.sender);
    	require(now                <= apex(loan));
    	bools[loan].marked = true;
    }

    function take(bytes32 loan, bytes32 secA1) public { // Withdraw
    	require(!off(loan));
    	require(bools[loan].pushed == true);
    	require(bools[loan].marked == true);
    	require(sha256(abi.encodePacked(secA1)) == sechs[loan].sechA1);
    	tokes[loan].transfer(loans[loan].bor, prin(loan));
    	bools[loan].taken = true;
    }

    function pay(bytes32 loan, uint256 amt) public { // Payback Loan
        // require(msg.sender                == loans[loan].bor); // NOTE: this is not necessary. Anyone can pay off the loan
    	require(!off(loan));
    	require(bools[loan].taken         == true);
    	require(now                       <= loans[loan].loex);
    	require(add(amt, backs[loan])     <= owed(loan));

    	tokes[loan].transferFrom(loans[loan].bor, address(this), amt);
    	backs[loan] = add(amt, backs[loan]);
    	if (backs[loan] == owed(loan)) {
    		bools[loan].paid = true;
    	}
    }

    function unpay(bytes32 loan) public { // Refund payback
    	require(!off(loan));
    	require(now              >  acex(loan));
    	require(bools[loan].paid == true);
    	require(msg.sender       == loans[loan].bor);
    	tokes[loan].transfer(loans[loan].bor, owed(loan));
    }

    function pull(bytes32 loan, bytes32 sec) public {
        pull(loan, sec, true); // Default to true for returning funds to Fund
    }

    function pull(bytes32 loan, bytes32 sec, bool fund) public { // Accept or Cancel // Bool fund set true if lender wants fund to return to fund
        require(!off(loan));
        require(bools[loan].taken == false || bools[loan].paid == true);
        require(sha256(abi.encodePacked(sec)) == sechs[loan].sechB1 || sha256(abi.encodePacked(sec)) == sechs[loan].sechC1);
        require(now                             <= acex(loan));
        require(bools[loan].sale                == false);
        if (bools[loan].taken == false) {
            tokes[loan].transfer(loans[loan].lend, loans[loan].prin);
        } else if (bools[loan].taken == true) {
            if (fundi[loan] == bytes32(0) || !fund) {
                tokes[loan].transfer(loans[loan].lend, lent(loan));
            } else {
                funds.push(fundi[loan], lent(loan));
            }
            tokes[loan].transfer(loans[loan].agent, lfee(loan));
        }
        bools[loan].off = true;
    }

    function sechi(bytes32 loan, bytes32 usr) private view returns (bytes32 sech) { // Get Secret Hash for Sale Index
    	if      (usr == 'A') { sech = sechs[loan].sechAS[sales.next(loan)]; }
    	else if (usr == 'B') { sech = sechs[loan].sechBS[sales.next(loan)]; }
    	else if (usr == 'C') { sech = sechs[loan].sechCS[sales.next(loan)]; }
    	else revert();
    }

    function sell(bytes32 loan) public returns (bytes32 sale) { // Start Auction
    	require(!off(loan));
        require(bools[loan].taken  == true);
    	if (sales.next(loan) == 0) {
    		if (now > loans[loan].loex) {
	    		require(bools[loan].paid == false);
			} else {
				require(!safe(loan));
			}
		} else {
			require(sales.next(loan) < 3);
			require(msg.sender == loans[loan].bor || msg.sender == loans[loan].lend);
		}
		sale = sales.open(loan, loans[loan].bor, loans[loan].lend, loans[loan].agent, sechi(loan, 'A'), sechi(loan, 'B'), sechi(loan, 'C'), tokes[loan], vares[loan]);
		bools[loan].sale = true;
    }
}