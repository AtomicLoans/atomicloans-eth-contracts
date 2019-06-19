import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Funds.sol';
import './Sales.sol';
import './DSMath.sol';
import './Medianizer.sol';

pragma solidity ^0.5.8;

contract Loans {
    using SafeMath for uint256;

    uint256 constant ASAEX = 3600; // All auction expiration

    Funds funds;
    Medianizer med;
    Sales sales;

    mapping (bytes32 => Loan)      public loans;
    mapping (bytes32 => Sechs)     public sechs;
    mapping (bytes32 => Bools)     public bools;
    mapping (bytes32 => bytes32)   public fundi;
    mapping (bytes32 => ERC20)     public tokes;
    mapping (bytes32 => uint256)   public backs;
    mapping (bytes32 => uint256)   public asaex; // All Auction expiration
    uint256                        public loani;

    uint256 apext = 7200;   // approval expiration threshold
    uint256 acext = 172800; // acceptance expiration threshold
    uint256 biext = 604800; // bidding expirataion threshold

    struct Loan {
    	address bor;     // Address Borrower
        address lend;    // Address Lender
        address agent;   // Optional Address automated agent
        uint256 born;    // Created At
        uint256 loex;    // Loan Expiration
        uint256 prin;     // Principal
        uint256 lint;    // Interest
        uint256 lpen;    // Liquidation Penalty
        uint256 lfee;    // Optional fee paid to auto if address not 0x0
        uint256 col;     // Collateral
        uint256 rat;     // Liquidation Ratio
        bytes   bpubk;   // Borrower PubKey
        bytes   lpubk;   // Lender PubKey
    }

    struct Sechs {
    	bytes32 sechA1;
    	bytes32 sechA2;
    	bytes32 sechB1;
    	bytes32 sechB2;
    	bytes32 sechC1;
    	bytes32 sechC2;
    	bool    set;
    }

    struct Bools {
    	bool pushed;
    	bool marked;
    	bool taken;
    	bool sale;
    	bool paid;
    	bool pulled;
    }

    constructor (address funds_, address med_) public {
    	funds = Funds(funds_);
    	med = Medianizer(med_);
    	sales = new Sales(address(this), med_);
    }

    function bor(bytes32 loan) public view returns (address) {
        return loans[loan].bor;
    }

    function apex(bytes32 loan) public view returns (uint256) { // Approval Expiration
        return loans[loan].born.add(apext);
    }

    function acex(bytes32 loan) public view returns (uint256) { // Acceptance Expiration
        return loans[loan].loex.add(acext);
    }

    function biex(bytes32 loan) public view returns (uint256) { // Bidding Expiration
        return loans[loan].loex.add(biext);
    }

    function prin(bytes32 loan) public view returns (uint256) {
    	return loans[loan].prin;
    }

    function lint(bytes32 loan) public view returns (uint256) {
    	return loans[loan].lint;
    }

    function lfee(bytes32 loan) public view returns (uint256) {
    	return loans[loan].lfee;
    }

    function lpen(bytes32 loan) public view returns (uint256) {
    	return loans[loan].lpen;
    }

    function col(bytes32 loan) public view returns (uint256) {
    	return loans[loan].col;
    }

    function back(bytes32 loan) public view returns (uint256) {
    	return backs[loan];
    }

    function rat(bytes32 loan) public view returns (uint256) {
    	return loans[loan].rat;
    }

    function pushed(bytes32 loan) public view returns (bool) {
    	return bools[loan].pushed;
    }

    function owed(bytes32 loan) public view returns (uint256) {
    	return loans[loan].prin.add(loans[loan].lint).add(loans[loan].lfee);
    }

    function dedu(bytes32 loan) public view returns (uint256) { // Deductible amount from collateral
    	return owed(loan).add(loans[loan].lpen);
    }

    function open(
        uint256           loex_,   // Loan Expiration
        address           bor_,    // Borrower Address
        address           lend_,   // Lender Address
        address           agent_,  // Optional Automated Agent
        uint256           prin_,   // Principal
        uint256           int_,    // Interest
        uint256           pen_,    // Liquidation penalty
        uint256           fee_,    // Optional Automation Fee
        uint256           col_,    // Collateral Amount (in satoshis)
        uint256           rat_,    // Liquidation Ratio
        bytes      memory bpubk_,  // Borrower Pubkey
        bytes      memory lpubk_,  // Lender Pubkey
        ERC20             tok_,    // Token
        bytes32           fundi_   // Optional Fund Index
    ) public returns (bytes32 loan) {
        loani = loani.add(1);
        loan = bytes32(loani);
        loans[loan].loex   = loex_;
        loans[loan].bor    = bor_;
        loans[loan].lend   = lend_;
        loans[loan].agent  = agent_;
        loans[loan].prin   = prin_;
        loans[loan].lint   = int_;
        loans[loan].lpen   = pen_;
        loans[loan].lfee   = fee_;
        loans[loan].col    = col_;
        loans[loan].rat    = rat_;
        loans[loan].bpubk  = bpubk_;
        loans[loan].lpubk  = lpubk_;
        tokes[loan]        = tok_;
        fundi[loan]        = fundi_;
        sechs[loan].set    = false;
    }

    function setSechs( // Set Secret Hashes for Loan
    	bytes32 loan,
    	bytes32 sechA1,
    	bytes32 sechA2,
    	bytes32 sechB1,
    	bytes32 sechB2,
    	bytes32 sechC1,
    	bytes32 sechC2
	) public returns (bool) {
		require(!sechs[loan].set);
		require(msg.sender == loans[loan].bor || msg.sender == loans[loan].lend);
    	sechs[loan].sechA1 = sechA1;
        sechs[loan].sechA2 = sechA2;
        sechs[loan].sechB1 = sechB1;
        sechs[loan].sechB2 = sechB2;
        sechs[loan].sechC1 = sechC1;
        sechs[loan].sechC2 = sechC2;
        sechs[loan].set    = true;
	}

	function colv(bytes32 loan) public returns (uint256) { // Current Collateral Value
    	uint256 val = uint(med.read());
    	return val.mul(col(loan)).div(10**8); // NOTE NEED TO SPECIFY 10**8 SOMEWHERE
    }

    function min(bytes32 loan) public returns (uint256) {  // Minimum Collateral Value
    	return (prin(loan).sub(back(loan))).mul(rat(loan)).div(10**18);
    }

    function safe(bytes32 loan) public returns (bool) {
        return colv(loan) >= min(loan);
    }

	function push(bytes32 loan, uint256 amt) public {
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
    	require(bools[loan].pushed == true);
    	require(bools[loan].marked == true);
    	require(sha256(abi.encodePacked(secA1)) == sechs[loan].sechA1);
    	tokes[loan].transfer(loans[loan].bor, prin(loan));
    	bools[loan].taken = true;
    }

    function pull(bytes32 loan, bytes32 secB1) public { // Accept or Cancel
    	require(bools[loan].taken == false || bools[loan].taken == true);
    	require(sha256(abi.encodePacked(secB1)) == sechs[loan].sechB1);
    	require(now                             <= acex(loan));
    	require(bools[loan].sale                == false);
    	if (bools[loan].taken == false) {
    		tokes[loan].transfer(loans[loan].lend, loans[loan].prin);
    		bools[loan].pulled = true;
		} else if (bools[loan].taken == true) {
			tokes[loan].transfer(loans[loan].lend, owed(loan));
			bools[loan].pulled = true;
		}
    }

    function pay(bytes32 loan, uint256 amt) public { // Payback Loan
    	require(bools[loan].taken         == true);
    	require(now                       <= loans[loan].loex);
    	require(msg.sender                == loans[loan].bor);
    	require(amt.add(backs[loan])      <= owed(loan));

    	tokes[loan].transferFrom(loans[loan].bor, address(this), amt);
    	backs[loan] = amt.add(backs[loan]);
    	if (backs[loan] == owed(loan)) {
    		bools[loan].paid = true;
    	}
    }

    function unpay(bytes32 loan) public { // Refund payback
    	require(now              >  acex(loan));
    	require(bools[loan].paid == true);
    	require(msg.sender       == loans[loan].bor);
    	tokes[loan].transfer(loans[loan].bor, owed(loan));
    }

    function sell(bytes32 loan) public { // Start Auction
    	if (now > loans[loan].loex) {
    		require(bools[loan].paid  == false);
    		require(bools[loan].taken == true);
		} else {
			require(!safe(loan));
		}

		bools[loan].sale = true;
    }
}
