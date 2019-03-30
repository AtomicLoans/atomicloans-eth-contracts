import 'openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './AutoAtomicLoan.sol';

pragma solidity ^0.4.25;

contract AutoAtomicLoanFund {
    using SafeMath for uint256;

    uint256 public secretHashCounter = 0;
    bytes32[] public secretHashes;
    bytes32[] public autoSecretHashes;
    uint256 public maxLoanAmount;

    address[] public atomicLoanContracts;

    uint256 minLoanDuration;
    uint256 maxLoanDuration;

    uint256 interestRate;
    uint256 liquidationFeeRate;

    StandardToken public token;

    address lender;
    address lenderAuto;

    constructor (
        bytes32[] memory _secretHashes,
        bytes32[] memory _autoSecretHashes,
        uint256 _maxLoanAmount,
        uint256 _minLoanDuration,
        uint256 _maxLoanDuration,
        uint256 _interestRate, // Hourly interest to ten decimal places (i.e. 0.000799086758% would be inputed as 7990868)
        uint256 _liquidationFeeRate,
        address _tokenAddress,
        address _lenderAuto
    ) public {
        secretHashes = _secretHashes;
        autoSecretHashes = _autoSecretHashes;
        maxLoanAmount = _maxLoanAmount;
        minLoanDuration = _minLoanDuration;
        maxLoanDuration = _maxLoanDuration;
        interestRate = _interestRate;
        liquidationFeeRate = _liquidationFeeRate;
        token = StandardToken(_tokenAddress);
        lender = msg.sender;
        lenderAuto = _lenderAuto;
    }

    function fund (uint256 _amount) public {
        token.transferFrom(msg.sender, address(this), _amount);
    }

    function requestLoan (
        uint256 _amount,
        bytes32[2] _secretHashesA,
        uint256 _loanDuration
    ) public returns (address) {
        require(_amount <= maxLoanAmount);
        require(_loanDuration <= maxLoanDuration);
        require(_loanDuration >= minLoanDuration);

        uint256 loanInterest = _amount.mul(_loanDuration.div(3600)).mul(interestRate).div(10**12);
        uint256 loanLiquidationFee = _amount.mul(_loanDuration.div(3600)).mul(interestRate).div(10**12);

        AutoAtomicLoan atomicLoan = new AutoAtomicLoan(
            _secretHashesA,
            [secretHashes[secretHashCounter], secretHashes[secretHashCounter + 1], secretHashes[secretHashCounter + 2]],
            [autoSecretHashes[secretHashCounter], autoSecretHashes[secretHashCounter + 1], autoSecretHashes[secretHashCounter + 2]],
            [ now + 21600, now + _loanDuration, now + _loanDuration + 259200, now + _loanDuration + 1209600],
            msg.sender,
            lender,
            lenderAuto,
            _amount,
            loanInterest, // Loan Interest
            loanLiquidationFee,
            86400,
            86400,
            token
        );
        
        atomicLoanContracts.push(address(atomicLoan));
        token.approve(atomicLoan, _amount.add(loanInterest).add(loanLiquidationFee));
        atomicLoan.fund();
        secretHashCounter = secretHashCounter.add(3);
        return address(atomicLoan);
    }

    function withdraw (uint _amount) public {
        require(msg.sender == lender);
        token.transfer(lender, _amount);
    }
}

