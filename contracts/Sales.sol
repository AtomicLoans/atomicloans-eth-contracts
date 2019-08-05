import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './Medianizer.sol';
import './DSMath.sol';

pragma solidity ^0.5.8;

contract Sales is DSMath { // Auctions
	Loans loans;
	Medianizer med;

    uint256 public constant SALEX = 3600;                         // Sales Expiration
    uint256 public constant SWAEX = 7200;                         // Swap Expiration
    uint256 public constant SETEX = 14400;                        // Settlement Expiration
    uint256 public constant MINBI = 1005000000000000000000000000; // Minimum Bid Increment in RAY

	address public deployer; // Only the Loans contract can edit data

	mapping (bytes32 => Sale)       public sales; // Auctions
	mapping (bytes32 => Sig)        public bsigs; // Borrower Signatures
	mapping (bytes32 => Sig)        public lsigs; // Lender Signatures
	mapping (bytes32 => Sig)        public asigs; // Lender Signatures
	mapping (bytes32 => SecretHash) public secretHashes; // Auction Secret Hashes
    uint256                         public salei; // Auction Index

    mapping (bytes32 => bytes32[])  public salel; // Loan Auctions (find by loanIndex)

    ERC20 public token;

    struct Sale {
        bytes32    loanIndex; // Loan Index
        uint256    bid;       // Current Bid
        address    bidr;      // Bidder
        address    borrower;  // Borrower
        address    lender;    // Lender
        address    agent;     // Optional Automated Agent
        uint256    born;      // Created At
        bytes20    pbkh;      // Bidder PubKey Hash
        bool       set;       // Sale at index opened
        bool       taken;     // Winning bid accepted
        bool       off;
    }

    struct Sig {
        bytes      rsig;  // Borrower Refundable Signature
        bytes      ssig;  // Borrower Seizable Signature
        bytes      rbsig; // Borrower Refundable Back Signature
        bytes      sbsig; // Borrower Seizable Back Signature
    }

    struct SecretHash {
        bytes32 secretHashA; // Secret Hash A
        bytes32 secretA;     // Secret A
        bytes32 secretHashB; // Secret Hash B
        bytes32 secretB;     // Secret B
        bytes32 secretHashC; // Secret Hash C
        bytes32 secretC;     // Secret C
        bytes32 secretHashD; // Secret Hash D
        bytes32 secretD;     // Secret D
    }

    function bid(bytes32 sale) public view returns (uint256) {
        return sales[sale].bid;
    }

    function bidr(bytes32 sale) public returns (address) {
        return sales[sale].bidr;
    }

    function borrower(bytes32 sale) public returns (address) {
        return sales[sale].borrower;
    }

    function lender(bytes32 sale) public returns (address) {
        return sales[sale].lender;
    }

    function agent(bytes32 sale) public returns (address) {
        return sales[sale].agent;
    }

    function salex(bytes32 sale) public returns (uint256) {
        return sales[sale].born + SALEX;
    }

    function swaex(bytes32 sale) public returns (uint256) {
        return sales[sale].born + SALEX + SWAEX;
    }

    function setex(bytes32 sale) public returns (uint256) {
        return sales[sale].born + SALEX + SETEX;
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

    function secretHashA(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretHashA;
    }

    function secretA(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretA;
    }

    function secretHashB(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretHashB;
    }

    function secretB(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretB;
    }

    function secretHashC(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretHashC;
    }

    function secretC(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretC;
    }

    function secretHashD(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretHashD;
    }

    function secretD(bytes32 sale) public returns (bytes32) {
        return secretHashes[sale].secretD;
    }

    constructor (Loans loans_, Medianizer med_, ERC20 token_) public {
    	deployer = address(loans_);
    	loans    = loans_;
    	med      = med_;
        token    = token_;
    }

    function next(bytes32 loan) public view returns (uint256) {
    	return salel[loan].length;
    }

    function create(
    	bytes32 loanIndex,   // Loan Index
    	address borrower,    // Address Borrower
    	address lender,      // Address Lender
        address agent,       // Optional Address automated agent
    	bytes32 secretHashA, // Secret Hash A
    	bytes32 secretHashB, // Secret Hash B
    	bytes32 secretHashC  // Secret Hash C
	) external returns(bytes32 sale) {
    	require(msg.sender == deployer);
    	salei = add(salei, 1);
        sale = bytes32(salei);
        sales[sale].loanIndex = loanIndex;
        sales[sale].borrower  = borrower;
        sales[sale].lender    = lender;
        sales[sale].agent     = agent;
        sales[sale].born      = now;
        sales[sale].set       = true;
        secretHashes[sale].secretHashA = secretHashA;
        secretHashes[sale].secretHashB = secretHashB;
        secretHashes[sale].secretHashC = secretHashC;
        salel[loanIndex].push(sale);
    }

    function offer(         // Bid on Collateral
    	bytes32 sale,       // Auction Index
    	uint256 amt,        // Bid Amount
    	bytes32 secretHash, // Secret Hash
    	bytes20 pbkh        // PubKeyHash
	) external {
        require(msg.sender != borrower(sale) && msg.sender != lender(sale));
		require(sales[sale].set);
	require(now < salex(sale));
    	require(amt > sales[sale].bid);
    	require(token.balanceOf(msg.sender) >= amt);
    	if (sales[sale].bid > 0) {
		require(amt > rmul(sales[sale].bid, MINBI)); // Make sure next bid is at least 0.5% more than the last bid
    	}

    	require(token.transferFrom(msg.sender, address(this), amt));
    	if (sales[sale].bid > 0) {
    		require(token.transfer(sales[sale].bidr, sales[sale].bid));
    	}
    	sales[sale].bidr = msg.sender;
    	sales[sale].bid  = amt;
    	secretHashes[sale].secretHashD = secretHash;
    	sales[sale].pbkh = pbkh;
	}

	function provideSig(       // Provide Signature to move collateral to collateral swap
		bytes32      sale,     // Auction Index
		bytes calldata rsig,   // Refundable Signature
		bytes calldata ssig,   // Seizable Signature
		bytes calldata rbsig,  // Refundable Back Signature
		bytes calldata sbsig   // Seizable Back Signataure
	) external {
		require(sales[sale].set);
		require(now < setex(sale));
		if (msg.sender == sales[sale].borrower) {
			bsigs[sale].rsig  = rsig;
			bsigs[sale].ssig  = ssig;
			bsigs[sale].rbsig = rbsig;
			bsigs[sale].sbsig = sbsig;
		} else if (msg.sender == sales[sale].lender) {
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

	function provideSecret(bytes32 sale, bytes32 secret_) external { // Provide Secret
		require(sales[sale].set);
		if      (sha256(abi.encodePacked(secret_)) == secretHashes[sale].secretHashA) { secretHashes[sale].secretA = secret_; }
        else if (sha256(abi.encodePacked(secret_)) == secretHashes[sale].secretHashB) { secretHashes[sale].secretB = secret_; }
        else if (sha256(abi.encodePacked(secret_)) == secretHashes[sale].secretHashC) { secretHashes[sale].secretC = secret_; }
        else if (sha256(abi.encodePacked(secret_)) == secretHashes[sale].secretHashD) { secretHashes[sale].secretD = secret_; }
        else                                                                          { revert(); }
	}

	function hasSecs(bytes32 sale) public view returns (bool) { // 2 of 3 secrets
		uint8 secs = 0;
		if (sha256(abi.encodePacked(secretHashes[sale].secretA)) == secretHashes[sale].secretHashA) { secs = secs + 1; }
		if (sha256(abi.encodePacked(secretHashes[sale].secretB)) == secretHashes[sale].secretHashB) { secs = secs + 1; }
		if (sha256(abi.encodePacked(secretHashes[sale].secretC)) == secretHashes[sale].secretHashC) { secs = secs + 1; }
		return (secs >= 2);
	}

	function take(bytes32 sale) external { // Withdraw Bid (Accept Bid and disperse funds to rightful parties)
        require(!taken(sale));
        require(!off(sale));
		require(now > salex(sale));
		require(hasSecs(sale));
		require(sha256(abi.encodePacked(secretHashes[sale].secretD)) == secretHashes[sale].secretHashD);
        sales[sale].taken = true;

        uint256 available = add(sales[sale].bid, loans.repaid(sales[sale].loanIndex));
        uint256 amount = min(available, loans.owedToLender(sales[sale].loanIndex));

        require(token.transfer(sales[sale].lender, amount));
        available = sub(available, amount);

        if (available >= add(loans.fee(sales[sale].loanIndex), loans.penalty(sales[sale].loanIndex))) {
            if (agent(sale) != address(0)) {
                require(token.transfer(sales[sale].agent, loans.fee(sales[sale].loanIndex)));
            }
            require(token.approve(address(med), loans.penalty(sales[sale].loanIndex)));
            med.push(loans.penalty(sales[sale].loanIndex), token);
            available = sub(available, add(loans.fee(sales[sale].loanIndex), loans.penalty(sales[sale].loanIndex)));
        } else if (available > 0) {
            require(token.approve(address(med), available));
            med.push(available, token);
            available = 0;
        }

        if (available > 0) { require(token.transfer(sales[sale].borrower, available)); }
	}

	function unpush(bytes32 sale) external { // Refund Bid
        require(!taken(sale));
        require(!off(sale));
		require(now > setex(sale));
		require(sales[sale].bid > 0);
        sales[sale].off = true;
		require(token.transfer(sales[sale].bidr, sales[sale].bid));
        if (next(sales[sale].loanIndex) == 3) {
            require(token.transfer(sales[sale].borrower, loans.repaid(sales[sale].loanIndex)));
        }
	}
}