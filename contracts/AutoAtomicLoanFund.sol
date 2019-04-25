import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './AutoAtomicLoan.sol';

pragma solidity ^0.5.2;

contract AutoAtomicLoanFund {
    using SafeMath for uint256;

    bytes32[] public secretHashes;
    bytes32[] public autoSecretHashes;
    uint256 public maxLoanAmount;

    address[] public atomicLoanContracts;

    uint256 public counter = 0;

    uint256 public minLoanDuration;
    uint256 public maxLoanDuration;

    uint256 public interestRate;
    uint256 public liquidationFeeRate;

    ERC20 public token;

    address payable public lender;
    address lenderAuto;

    bytes32 public aCoinPubKeyPrefix;
    bytes32 public aCoinPubKeySuffix;

    uint256 public collateralizationRatio;

    constructor (
        bytes32[] memory _secretHashes,
        bytes32[] memory _autoSecretHashes,
        uint256 _maxLoanAmount,
        uint256 _minLoanDuration,
        uint256 _maxLoanDuration,
        uint256 _interestRate, // Hourly interest to ten decimal places (i.e. 0.000799086758% would be inputed as 7990868)
        uint256 _liquidationFeeRate,
        address _tokenAddress,
        address _lenderAuto,
        bytes32 _aCoinPubKeyPrefix,
        bytes32 _aCoinPubKeySuffix,
        uint256 _collateralizationRatio // Min collateralization ratio to 6 decimal places
    ) public {
        secretHashes = _secretHashes;
        autoSecretHashes = _autoSecretHashes;
        maxLoanAmount = _maxLoanAmount;
        minLoanDuration = _minLoanDuration;
        maxLoanDuration = _maxLoanDuration;
        interestRate = _interestRate;
        liquidationFeeRate = _liquidationFeeRate;
        token = ERC20(_tokenAddress);
        lender = msg.sender;
        lenderAuto = _lenderAuto;
        aCoinPubKeyPrefix = _aCoinPubKeyPrefix;
        aCoinPubKeySuffix = _aCoinPubKeySuffix;
        collateralizationRatio = _collateralizationRatio;
    }

    function requestLoan (
        uint256 _amount,
        bytes32[2] memory _secretHashesA,
        uint256 _loanDuration
    ) public returns (address) {
        require(_amount <= maxLoanAmount);
        require(_loanDuration <= maxLoanDuration);
        require(_loanDuration >= minLoanDuration);

        uint256 loanInterest = _amount.mul(_loanDuration.div(3600)).mul(interestRate).div(10**12);
        uint256 loanLiquidationFee = _amount.mul(_loanDuration.div(3600)).mul(interestRate).div(10**12);

        AutoAtomicLoan atomicLoan = new AutoAtomicLoan(
            _secretHashesA,
            [secretHashes[counter * 2], secretHashes[(counter * 2) + 1]],
            [autoSecretHashes[counter * 2], autoSecretHashes[(counter * 2) + 1]],
            [ now + 21600, now + _loanDuration, now + _loanDuration + 259200, now + (_loanDuration * 2)],
            msg.sender,
            lender,
            lenderAuto,
            _amount,
            loanInterest,
            loanLiquidationFee,
            42300,
            42300,
            address(token)
        );
        
        atomicLoanContracts.push(address(atomicLoan));
        token.approve(address(atomicLoan), _amount.add(loanInterest).add(loanLiquidationFee));
        atomicLoan.fund();
        counter = counter.add(1);
        return address(atomicLoan);
    }

    function withdraw (uint256 _amount) public {
        require(msg.sender == lender);
        token.transfer(lender, _amount);
    }
}
