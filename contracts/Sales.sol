import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './Medianizer.sol';
import './DSMath.sol';
import './Vars.sol';

pragma solidity ^0.5.8;

contract Sales is DSMath { // Auctions
	Loans loans;
	Medianizer med;

	address public own; // Only the Loans contract can edit data

	mapping (bytes32 => Sale)       public sales; // Auctions
	mapping (bytes32 => ERC20)      public tokes; // Auction token
    mapping (bytes32 => Vars)       public vares; // Vars contract
	mapping (bytes32 => Bsig)       public bsigs; // Borrower Signatures
	mapping (bytes32 => Lsig)       public lsigs; // Lender Signatures
	mapping (bytes32 => Asig)       public asigs; // Lender Signatures
	mapping (bytes32 => Sech)       public sechs; // Auction Secret Hashes
    uint256                         public salei; // Auction Index

    mapping (bytes32 => bytes32[])  public salel; // Loan Auctions (find by loani)

    struct Sale {
        bytes32    loani;  // Loan Index
        uint256    bid;    // Current Bid
        address    bidr;   // Bidder
        address    bor;    // Borrower
        address    lend;   // Lender
        address    agent;  // Optional Automated Agent
        uint256    salex;  // Auction Bidding Expiration
        uint256    setex;  // Auction Settlement Expiration
        bytes20    pbkh;   // Bidder PubKey Hash
        bool       set;    // Sale at index opened
        bool       taken;  // Winning bid accepted
        bool       off;
    }

    struct Bsig {
    	bytes      rsig;  // Borrower Refundable Signature
        bytes      ssig;  // Borrower Seizable Signature
        bytes      rbsig; // Borrower Refundable Back Signature
        bytes      sbsig; // Borrower Seizable Back Signature
    }

    struct Lsig {
    	bytes      rsig;  // Lender Refundable Signature
        bytes      ssig;  // Lender Seizable Signature
        bytes      rbsig; // Lender Refundable Back Signature
        bytes      sbsig; // Lender Seizable Back Signature
    }

    struct Asig {
    	bytes      rsig;  // Agent Refundable Signature
        bytes      ssig;  // Agent Seizable Signature
        bytes      rbsig; // Agent Refundable Back Signature
        bytes      sbsig; // Agent Seizable Back Signature
    }

    struct Sech {
        bytes32    sechA; // Secret Hash A
        bytes32    secA;  // Secret A
        bytes32    sechB; // Secret Hash B
        bytes32    secB;  // Secret B
        bytes32    sechC; // Secret Hash C
        bytes32    secC;  // Secret C
        bytes32    sechD; // Secret Hash D
        bytes32    secD;  // Secret D
    }

    function bid(bytes32 sale) public returns (uint256) {
        return sales[sale].bid;
    }

    function bidr(bytes32 sale) public returns (address) {
        return sales[sale].bidr;
    }

    function bor(bytes32 sale) public returns (address) {
        return sales[sale].bor;
    }

    function lend(bytes32 sale) public returns (address) {
        return sales[sale].lend;
    }

    function agent(bytes32 sale) public returns (address) {
        return sales[sale].agent;
    }

    function salex(bytes32 sale) public returns (uint256) {
        return sales[sale].salex;
    }

    function setex(bytes32 sale) public returns (uint256) {
        return sales[sale].setex;
    }

    function pbkh(bytes32 sale) public returns (bytes20) {
        return sales[sale].pbkh;
    }

    function taken(bytes32 sale) public returns (bool) {
        return sales[sale].taken;
    }

    function off(bytes32 sale) public returns (bool) {
        return sales[sale].off;
    }

    function sechA(bytes32 sale) public returns (bytes32) {
        return sechs[sale].sechA;
    }

    function secA(bytes32 sale) public returns (bytes32) {
        return sechs[sale].secA;
    }

    function sechB(bytes32 sale) public returns (bytes32) {
        return sechs[sale].sechB;
    }

    function secB(bytes32 sale) public returns (bytes32) {
        return sechs[sale].secB;
    }

    function sechC(bytes32 sale) public returns (bytes32) {
        return sechs[sale].sechC;
    }

    function secC(bytes32 sale) public returns (bytes32) {
        return sechs[sale].secC;
    }

    function sechD(bytes32 sale) public returns (bytes32) {
        return sechs[sale].sechD;
    }

    function secD(bytes32 sale) public returns (bytes32) {
        return sechs[sale].secD;
    }

    constructor (address loans_, address med_) public {
    	own   = loans_;
    	loans = Loans(loans_);
    	med   = Medianizer(med_);
    }

    function next(bytes32 loan) public view returns (uint256) {
    	return salel[loan].length;
    }

    function open(
    	bytes32 loani, // Loan Index
    	address bor,   // Address Borrower
    	address lend,  // Address Lender
        address agent, // Optional Address automated agent
    	bytes32 sechA, // Secret Hash A
    	bytes32 sechB, // Secret Hash B
    	bytes32 sechC, // Secret Hash C
    	ERC20   tok,   // Debt Token
        Vars    vars   // Variable contract
	) public returns(bytes32 sale) {
    	require(msg.sender == own);
    	salei = add(salei, 1);
        sale = bytes32(salei);
        sales[sale].loani = loani;
        sales[sale].bor   = bor;
        sales[sale].lend  = lend;
        sales[sale].agent = agent;
        sales[sale].salex = now + vars.SALEX();
        sales[sale].setex = now + vars.SALEX() + vars.SETEX();
        tokes[sale]       = tok;
        vares[sale]       = vars;
        sales[sale].set   = true;
        sechs[sale].sechA = sechA;
        sechs[sale].sechB = sechB;
        sechs[sale].sechC = sechC;
        salel[loani].push(sale);
    }

    function push(     // Bid on Collateral
    	bytes32 sale,  // Auction Index
    	uint256 amt,   // Bid Amount
    	bytes32 sech,  // Secret Hash
    	bytes20 pbkh   // PubKeyHash
	) public {
        require(msg.sender != bor(sale) && msg.sender != lend(sale));
		require(sales[sale].set);
    	require(now < sales[sale].salex);
    	require(amt > sales[sale].bid);
    	require(tokes[sale].balanceOf(msg.sender) >= amt);
    	if (sales[sale].bid > 0) {
    		require(amt > rmul(sales[sale].bid, vares[sale].MINBI())); // Make sure next bid is at least 0.5% more than the last bid
    	}

    	require(tokes[sale].transferFrom(msg.sender, address(this), amt));
    	if (sales[sale].bid > 0) {
    		require(tokes[sale].transfer(sales[sale].bidr, sales[sale].bid));
    	}
    	sales[sale].bidr = msg.sender;
    	sales[sale].bid  = amt;
    	sechs[sale].sechD = sech;
    	sales[sale].pbkh = pbkh;
	}

	function sign(           // Provide Signature to move collateral to collateral swap
		bytes32      sale,   // Auction Index
		bytes memory rsig,   // Refundable Signature
		bytes memory ssig,   // Seizable Signature
		bytes memory rbsig,  // Refundable Back Signature
		bytes memory sbsig   // Seizable Back Signataure
	) public {
		require(sales[sale].set);
		require(now < sales[sale].setex);
		if (msg.sender == sales[sale].bor) {
			bsigs[sale].rsig  = rsig;
			bsigs[sale].ssig  = ssig;
			bsigs[sale].rbsig = rbsig;
			bsigs[sale].sbsig = sbsig;
		} else if (msg.sender == sales[sale].lend) {
			lsigs[sale].rsig  = rsig;
			lsigs[sale].ssig  = ssig;
			lsigs[sale].rbsig = rbsig;
			lsigs[sale].sbsig = sbsig;
		} else if (msg.sender == sales[sale].agent) {
			asigs[sale].rsig  = rsig;
			asigs[sale].ssig  = ssig;
			asigs[sale].rbsig = rbsig;
			asigs[sale].sbsig = sbsig;
		} else {
			revert();
		}
	}

	function sec(bytes32 sale, bytes32 sec_) public { // Provide Secret
		require(sales[sale].set);
		if      (sha256(abi.encodePacked(sec_)) == sechs[sale].sechA) { sechs[sale].secA = sec_; }
        else if (sha256(abi.encodePacked(sec_)) == sechs[sale].sechB) { sechs[sale].secB = sec_; }
        else if (sha256(abi.encodePacked(sec_)) == sechs[sale].sechC) { sechs[sale].secC = sec_; }
        else if (sha256(abi.encodePacked(sec_)) == sechs[sale].sechD) { sechs[sale].secD = sec_; }
        else                                                          { revert(); }
	}

	function hasSecs(bytes32 sale) public view returns (bool) { // 2 of 3 secrets
		uint8 secs = 0;
		if (sha256(abi.encodePacked(sechs[sale].secA)) == sechs[sale].sechA) { secs = secs + 1; }
		if (sha256(abi.encodePacked(sechs[sale].secB)) == sechs[sale].sechB) { secs = secs + 1; }
		if (sha256(abi.encodePacked(sechs[sale].secC)) == sechs[sale].sechC) { secs = secs + 1; }
		return (secs >= 2);
	}

	function take(bytes32 sale) public { // Withdraw Bid (Accept Bid and disperse funds to rightful parties)
        require(!taken(sale));
        require(!off(sale));
		require(now > sales[sale].salex);
		require(hasSecs(sale));
		require(sha256(abi.encodePacked(sechs[sale].secD)) == sechs[sale].sechD);
        sales[sale].taken = true;
        if (sales[sale].bid > (loans.dedub(sales[sale].loani))) {
            require(tokes[sale].transfer(sales[sale].lend, loans.lent(sales[sale].loani)));
            if (agent(sale) != address(0)) {
                require(tokes[sale].transfer(sales[sale].agent, loans.lfee(sales[sale].loani)));
            }
            require(tokes[sale].approve(address(med), loans.lpen(sales[sale].loani)));
            med.push(loans.lpen(sales[sale].loani), tokes[sale]);
            require(tokes[sale].transfer(sales[sale].bor, sub(add(sales[sale].bid, loans.back(sales[sale].loani)), loans.dedu(sales[sale].loani))));
        } else {
            require(tokes[sale].transfer(sales[sale].lend, sales[sale].bid));
        }
	}

	function unpush(bytes32 sale) public { // Refund Bid
        require(!taken(sale));
        require(!off(sale));
		require(now > sales[sale].setex);
		require(!hasSecs(sale));
		require(sha256(abi.encodePacked(sechs[sale].secD)) != sechs[sale].sechD);
		require(sales[sale].bid > 0);
		require(tokes[sale].transfer(sales[sale].bidr, sales[sale].bid));
        if (next(sales[sale].loani) == 3) {
            require(tokes[sale].transfer(sales[sale].bor, loans.back(sales[sale].loani)));
        }
        sales[sale].off = true;
	}
}