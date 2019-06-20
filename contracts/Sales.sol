import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './Medianizer.sol';
import './DSMath.sol';

contract Sales is DSMath { // Auctions
	Loans loans;
	Medianizer med;

	address own; // Only the Loans contract can edit data

	uint256 constant SALEX = 3600;
	uint256 constant SATEX = 14400;
	uint256 constant MINBI = 1005000000000000000000000000; // Minimum Bid Increment in RAY

	mapping (bytes32 => Sale)       public sales; // Auctions
	mapping (bytes32 => ERC20)      public tokes; // Auction token
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
        address    bor;    // Lender
        address    lend;   // Borrower
        address    agent;  // Optional Automated Agent
        uint256    salex;  // Auction Bidding Expiration
        uint256    setex;  // Auction Settlement Expiration
        bytes32    pbkh;   // Bidder PubKey Hash
        bool       set;
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
        bytes32    sechA;  // Secret Hash A
        bytes32    secA;
        bytes32    sechB;  // Secret Hash B
        bytes32    secB;
        bytes32    sechC;   // Secret Hash
        bytes32    secC;    // Secret
        bytes32    sechD;
        bytes32    secD;
    }

    constructor (address loans_, address med_) public {
    	own = msg.sender;
    	loans = Loans(loans_);
    	med = Medianizer(med_);
    }

    function next(bytes32 loan) public returns (uint256) {
    	return salel[loan].length;
    }

    function open(
    	bytes32 loani,
    	address bor,
    	address lend,
    	bytes32 sechA,
    	bytes32 sechB,
    	bytes32 sechC,
    	ERC20   tok
	) public returns(bytes32 sale) {
    	require(msg.sender == own);
    	salei = add(salei, 1);
        sale = bytes32(salei);
        sales[sale].loani = loani;
        sales[sale].salex = now + SALEX;
        sales[sale].setex = now + SALEX + SATEX;
        tokes[sale] = tok;
        sales[sale].set = true;
        sechs[sale].sechA = sechA;
        sechs[sale].sechB = sechB;
        salel[loani].push(sale);
    }

    function push(
    	bytes32 sale,
    	uint256 amt,
    	bytes32 sech,
    	bytes32 pbkh
	) public {
		require(sales[sale].set);
    	require(now < sales[sale].salex);
    	require(amt > sales[sale].bid);
    	require(tokes[sale].balanceOf(msg.sender) >= amt);
    	if (sales[sale].bid > 0) {
    		require(amt > rmul(sales[sale].bid, MINBI)); // Make sure next bid is at least 0.5% more than the last bid
    	}

    	tokes[sale].transferFrom(msg.sender, address(this), amt);
    	if (sales[sale].bid > 0) {
    		tokes[sale].transfer(sales[sale].bidr, sales[sale].bid);
    	}
    	sales[sale].bidr = msg.sender;
    	sales[sale].bid  = amt;
    	sechs[sale].sechC = sech;
    	sales[sale].pbkh = pbkh;
	}

	function sign(
		bytes32      sale,
		bytes memory rsig,
		bytes memory ssig,
		bytes memory rbsig,
		bytes memory sbsig
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

	function sec(bytes32 sale, bytes32 sec) public {
		require(sales[sale].set);
		if (msg.sender == sales[sale].bor) {
            require(sha256(abi.encodePacked(sec)) == sechs[sale].sechA);
            sechs[sale].secA = sec;
        } else if (msg.sender == sales[sale].lend) {
            require(sha256(abi.encodePacked(sec)) == sechs[sale].sechB);
            sechs[sale].secB = sec;
        } else if (msg.sender == sales[sale].agent) {
            require(sha256(abi.encodePacked(sec)) == sechs[sale].sechC);
            sechs[sale].secC = sec;
        } else if (msg.sender == sales[sale].bidr) {
        	require(sha256(abi.encodePacked(sec)) == sechs[sale].sechD);
        	sechs[sale].secD = sec;
    	} else {
            revert();
        }
	}

	function hasSecs(bytes32 sale) public returns (bool) {
		uint8 secs = 0;
		if (sha256(abi.encodePacked(sechs[sale].secA)) == sechs[sale].sechA) { secs = secs + 1; }
		if (sha256(abi.encodePacked(sechs[sale].secB)) == sechs[sale].sechB) { secs = secs + 1; }
		if (sha256(abi.encodePacked(sechs[sale].secC)) == sechs[sale].sechC) { secs = secs + 1; }
		return (secs >= 2);
	}

	function take(bytes32 sale) public {
		require(now > sales[sale].salex);
		require(hasSecs(sale));
		require(sha256(abi.encodePacked(sechs[sale].secD)) == sechs[sale].sechD);

        if (sales[sale].bid > (loans.dedu(sales[sale].loani))) {
            tokes[sale].transfer(sales[sale].lend, add(loans.prin(sales[sale].loani), loans.lint(sales[sale].loani)));
            tokes[sale].transfer(sales[sale].agent, loans.lfee(sales[sale].loani));
            tokes[sale].approve(address(med), loans.lpen(sales[sale].loani));
            med.push(loans.lpen(sales[sale].loani));
            tokes[sale].transfer(sales[sale].bor, sub(sales[sale].bid, loans.dedu(sales[sale].loani)));
        } else {
            tokes[sale].transfer(sales[sale].lend, sales[sale].bid);
        }
	}

	function unpush(bytes32 sale) public {
		require(now > sales[sale].setex);
		require(!hasSecs(sale));
		require(sha256(abi.encodePacked(sechs[sale].secD)) != sechs[sale].sechD);
		require(sales[sale].bid > 0);
		tokes[sale].transfer(sales[sale].bidr, sales[sale].bid);
	}
}