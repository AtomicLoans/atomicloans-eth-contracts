import 'openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

pragma solidity ^0.4.25;

contract AtomicLoan {
    using SafeMath for uint256;

    address borrower;
    address lender;
    address bidder;
    
    bytes32 secretHashA1;
    bytes32 secretHashA2;
    bytes32 secretHashB1;
    bytes32 secretHashB2;
    bytes32 secretHashB3;
    bytes32 secretHashC;
    
    bytes32 public secretA2;
    bytes32 public secretB2;
    bytes32 public secretB3;
    bytes32 public secretC;
    
    uint256 withdrawExpiration;
    uint256 loanExpiration;
    uint256 acceptExpiration;
    uint256 biddingExpiration;
    
    uint256 biddingTimeout;
    uint256 biddingRefund;
    
    uint256 public principal;
    uint256 public interest;
    uint256 public liquidationFee;
    
    bool public funded = false;
    bool public approved = false;
    bool public withdrawn = false;
    bool public bidding = false;
    bool public repaid = false;
    
    uint256 currentBid = 0;
    uint256 biddingTimeoutExpiration;
    uint256 biddingRefundExpiration;
    
    string public borrowerSignature;
    string public lenderSignature;
    
    bool borrowerLiquidatedCollateralWithdrawn = false;
    bool lenderLiquidatedCollateralWidthdrawn = false;
    bool liquidatedCollateralWidthdrawn = false;

    string aCoinAddress;

    StandardToken public token;

    constructor (
        bytes32 _secretHashA1,
        bytes32 _secretHashA2,
        bytes32 _secretHashB1,
        bytes32 _secretHashB2,
        bytes32 _secretHashB3,
        uint256 _withdrawExpiration,
        uint256 _loanExpiration,
        uint256 _acceptExpiration,
        uint256 _biddingExpiration,
        address _borrower,
        uint256 _principal,
        uint256 _interest,
        uint256 _liquidationFee,
        uint256 _biddingTimeout,
        uint256 _biddingRefund,
        address _tokenAddress
    ) public {
        secretHashA1 = _secretHashA1;
        secretHashA2 = _secretHashA2;
        secretHashB1 = _secretHashB1;
        secretHashB2 = _secretHashB2;
        secretHashB3 = _secretHashB3;
        withdrawExpiration = _withdrawExpiration;
        loanExpiration = _loanExpiration;
        acceptExpiration = _acceptExpiration;
        biddingExpiration = _biddingExpiration;
        borrower = _borrower;
        lender = msg.sender;
        principal = _principal;
        interest = _interest;
        liquidationFee = _liquidationFee;
        biddingTimeout = _biddingTimeout;
        biddingRefund = _biddingRefund;
        token = StandardToken(_tokenAddress);
    }

    function fund () public {
        require(funded == false);
        token.transferFrom(msg.sender, address(this), principal);
        funded = true;
    }
    
    function approve (bytes32 _secretB1) public {
        require(funded == true);
        require(sha256(abi.encodePacked(_secretB1)) == secretHashB1);
        require(now <= withdrawExpiration);
        approved = true;
    }
    
    function withdraw (bytes32 _secretA1, bytes32 _secretB1) public {
        require(funded == true);
        require(approved == true);
        require(sha256(abi.encodePacked(_secretA1)) == secretHashA1);
        require(sha256(abi.encodePacked(_secretB1)) == secretHashB1);
        token.transfer(borrower, token.balanceOf(address(this)));
        withdrawn = true;
    }

    function accept_or_cancel (bytes32 _secretB2) public {
        require(sha256(abi.encodePacked(_secretB2)) == secretHashB2);
        require(now > withdrawExpiration);
        require(now <= acceptExpiration);
        require(bidding == false);
        token.transfer(lender, token.balanceOf(address(this)));
        selfdestruct(lender);
    }
    
    function payback () public {
        require(withdrawn == true);
        require(now <= loanExpiration);
        require(msg.sender == borrower);
        token.transferFrom(borrower, address(this), principal.add(interest));
        repaid = true;
    }

    function refundPayback () public {
        require(now > acceptExpiration);
        require(repaid == true);
        require(msg.sender == borrower);
        token.transfer(borrower, token.balanceOf(address(this)));
        selfdestruct(borrower);
    }
    
    function startBidding () public {
        require(repaid == false);
        require(withdrawn == true);
        require(now > loanExpiration);
        require(msg.sender == borrower || msg.sender == lender);
        biddingTimeoutExpiration = now.add(biddingTimeout);
        biddingRefundExpiration = biddingTimeoutExpiration.add(biddingRefund);
        bidding = true;
    }
    
    function bid (bytes32 _secretHashC, uint256 _bidValue, string _aCoinAddress) public {
        require(bidding == true);
        require(now > loanExpiration);
        require(now <= biddingTimeoutExpiration);
        require(_bidValue > currentBid);
        require(token.balanceOf(msg.sender) >= _bidValue);
        token.transferFrom(msg.sender, address(this), _bidValue);
        if (currentBid > 0) {
            token.transfer(bidder, currentBid);
        }
        bidder = msg.sender;
        currentBid = _bidValue;
        secretHashC = _secretHashC;
        aCoinAddress = _aCoinAddress;
    }
    
    function provideSignature (string memory _signature) public {
        require(now > loanExpiration); // Is this needed? 
        if (msg.sender == borrower) {
            borrowerSignature = _signature;
        } else if (msg.sender == lender) {
            lenderSignature = _signature;
        } else {
            revert();
        }
    }
    
    function provideSecret (bytes32 _secret) public {
        require(now > loanExpiration);
        if (msg.sender == borrower) {
            require(sha256(abi.encodePacked(_secret)) == secretHashA2);
            secretA2 = _secret;
        } else if (msg.sender == lender) {
            require(sha256(abi.encodePacked(_secret)) == secretHashB3);
            secretB3 = _secret;
        } else if (msg.sender == bidder) {
            require(sha256(abi.encodePacked(_secret)) == secretHashC);
            secretC = _secret;
        } else {
            revert();
        }
    }
    
    function withdrawLiquidatedCollateral (bytes32 _secretA2, bytes32 _secretB3, bytes32 _secretC) public {
        require(now > biddingTimeoutExpiration);
        require(sha256(abi.encodePacked(_secretA2)) == secretHashA2);
        require(sha256(abi.encodePacked(_secretB3)) == secretHashB3);
        require(sha256(abi.encodePacked(_secretC)) == secretHashC);
        require(msg.sender == borrower || msg.sender == lender);
        if (currentBid > (principal.add(interest).add(liquidationFee))) {
            token.transfer(lender, (principal.add(interest).add(liquidationFee)));
            token.transfer(borrower, token.balanceOf(address(this)));
        } else {
            token.transfer(lender, currentBid);
        }
        selfdestruct(lender);
    }
    
    function refundBid () public {
        require(now > biddingRefundExpiration);
        require(sha256(abi.encodePacked(secretC)) != secretHashC || sha256(abi.encodePacked(secretA2)) != secretHashA2 || sha256(abi.encodePacked(secretB3)) != secretHashB3);
        require(currentBid > 0);
        token.transfer(bidder, currentBid);
        selfdestruct(lender);
    }
}