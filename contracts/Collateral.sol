pragma solidity 0.5.10;

import {BytesLib} from "@summa-tx/bitcoin-spv-sol/contracts/BytesLib.sol";
import {BTCUtils} from "@summa-tx/bitcoin-spv-sol/contracts/BTCUtils.sol";

import './Loans.sol';
import './P2WSHInterface.sol';
import './ISPVRequestManager.sol';
import './DSMath.sol';

contract Collateral is DSMath {
    P2WSHInterface p2wsh;
    ISPVRequestManager onDemandSpv;
    Loans loans;

    uint256 public constant ADD_COLLATERAL_EXPIRY = 4 hours;

    mapping (bytes32 => CollateralDetails)   public collaterals;
    mapping (bytes32 => LoanRequests)        public loanRequests;
    mapping (uint256 => RequestDetails)      public requestsDetails;
    mapping (uint256 => uint256)             public finalRequestToInitialRequest;

    mapping (bytes32 => CollateralDetails)                     public temporaryCollaterals;
    mapping (bytes32 => mapping(uint256 => CollateralDeposit)) public collateralDeposits;
    mapping (bytes32 => uint256)                               public collateralDepositIndex;
    mapping (bytes32 => uint256)                               public collateralDepositFinalizedIndex;

    mapping (bytes32 => mapping(uint8 => uint256))             public txidToOutputIndexToCollateralDepositIndex;
    mapping (bytes32 => mapping(uint8 => bool))                public txidToOutputToRequestValid;

    address deployer;

    struct CollateralDetails {
        uint256 refundableCollateral;
        uint256 seizableCollateral;
        uint256 unaccountedRefundableCollateral; // RefundableCollateral that's not accounted for since minSeizableCollateral is not satisfied
    }

    struct CollateralDeposit {
        uint256 amount;
        bool    finalized; // 6 confirmations
        bool    seizable;
        uint256 expiry;
    }

    struct RequestDetails {
        bytes32 loan;
        bool    finalized; // 6 confirmations?
        bool    seizable;
        bytes32 p2wshAddress;
    }

    struct LoanRequests {
        uint256 refundRequestIDOneConf;
        uint256 refundRequestIDSixConf;
        uint256 seizeRequestIDOneConf;
        uint256 seizeRequestIDSixConf;
    }

    event Spv(bytes32 _txid, bytes _vout, uint256 _requestID, uint8 _outputIndex);

    function collateral(bytes32 loan) public view returns (uint256) {
        // check if collateralDepositIndex == collateralDepositFinalizedIndex
        if (collateralDepositIndex[loan] != collateralDepositFinalizedIndex[loan] &&
            add(collaterals[loan].seizableCollateral, temporaryCollaterals[loan].seizableCollateral) >= loans.minSeizableCollateralValue(loan) &&
            now < collateralDeposits[loan][collateralDepositFinalizedIndex[loan]].expiry) {
            return add(add(refundableCollateral(loan), seizableCollateral(loan)), add(temporaryCollaterals[loan].refundableCollateral, temporaryCollaterals[loan].seizableCollateral));
        } else {
            return add(refundableCollateral(loan), seizableCollateral(loan));
        }
    }

    function refundableCollateral(bytes32 loan) public view returns (uint256) {
        return collaterals[loan].refundableCollateral;
    }

    function seizableCollateral(bytes32 loan) public view returns (uint256) {
        return collaterals[loan].seizableCollateral;
    }

    function temporaryRefundableCollateral(bytes32 loan) public view returns (uint256) {
        return temporaryCollaterals[loan].refundableCollateral;
    }

    function temporarySeizableCollateral(bytes32 loan) public view returns (uint256) {
        return temporaryCollaterals[loan].seizableCollateral;
    }

    constructor (Loans loans_) public {
        require(address(loans_) != address(0), "Loans address must be non-zero");

        loans = loans_;
        deployer = msg.sender;
    }

    /**
     * @dev Sets P2WSH contract
     * @param p2wsh_ Address of P2WSH contract
     */
    function setP2WSH(P2WSHInterface p2wsh_) external {
        require(msg.sender == deployer, "Loans.setP2WSH: Only the deployer can perform this");
        require(address(p2wsh) == address(0), "Loans.setP2WSH: The P2WSH address has already been set");
        require(address(p2wsh_) != address(0), "Loans.setP2WSH: P2WSH address must be non-zero");
        p2wsh = p2wsh_;
    }

    /**
     * @dev Sets OnDemandSpv contract address
     * @param onDemandSpv_ Address of OnDemandSpv contract
     */
    function setOnDemandSpv(ISPVRequestManager onDemandSpv_) external {
        require(msg.sender == deployer, "Loans.setOnDemandSpv: Only the deployer can perform this");
        require(address(onDemandSpv) == address(0), "Loans.setOnDemandSpv: The OnDemandSpv address has already been set");
        require(address(onDemandSpv_) != address(0), "Loans.setOnDemandSpv: OnDemandSpv address must be non-zero");
        onDemandSpv = onDemandSpv_;
    }

    function setCollateral(bytes32 loan, uint256 refundableCollateral_, uint256 seizableCollateral_) external {
        require(msg.sender == address(loans), "Loans.setCollateral: Only the loans contract can perform this");

        collaterals[loan].refundableCollateral = refundableCollateral_;
        collaterals[loan].seizableCollateral = seizableCollateral_;
    }

    /**
     * @notice Consumer for Bitcoin transaction information
     * @dev Handles Bitcoin events that have been validated by the Relay contract (onDemandSpv by Summa)
     * @param _vout        The length-prefixed output vector of the bitcoin tx
     *                     that triggered the notification.
     * @param _requestID   The ID of the event request that this notification
     *                     satisfies. The ID is returned by
     *                     OnDemandSPV.request and should be locally stored by
     *                     any contract that makes more than one request.
     * @param _outputIndex The index of the output in the _vout that triggered
     *                     the notification. Useful for subscribing to transactions
     *                     that spend the newly-created UTXO.
     */
    function spv(bytes32 _txid, bytes calldata, bytes calldata _vout, uint256 _requestID, uint8, uint8 _outputIndex) external {
        emit Spv(_txid, _vout, _requestID, _outputIndex);

        require(msg.sender == address(onDemandSpv), "Collateral.spv: Only the onDemandSpv can perform this");

        require(_txid != bytes32(0), "Collateral.spv: txid should be non-zero");
        require(BytesLib.toBytes32(_vout) != bytes32(0), "Collateral.spv: vout should be non-zero");

        bytes memory outputAtIndex = BTCUtils.extractOutputAtIndex(_vout, _outputIndex);
        uint256 amount = uint(BTCUtils.extractValue(outputAtIndex));

        bytes32 loan = requestsDetails[_requestID].loan;

        require(
            BytesLib.toBytes32(BTCUtils.extractHash(outputAtIndex)) == requestsDetails[_requestID].p2wshAddress,
            "Collateral.spv: Incorrect P2WSH address"
        );

        if (requestsDetails[_requestID].finalized) { // 6 confirmations
            if (txidToOutputToRequestValid[_txid][_outputIndex]) { // Check that request is valid
                if (requestsDetails[_requestID].seizable) {
                    collaterals[loan].seizableCollateral = add(collaterals[loan].seizableCollateral, amount);

                    temporaryCollaterals[loan].seizableCollateral = sub(temporaryCollaterals[loan].seizableCollateral, amount);
                } else {

                    if (collaterals[loan].seizableCollateral >= loans.minSeizableCollateralValue(loan)) {
                        collaterals[loan].refundableCollateral = add(collaterals[loan].refundableCollateral, amount);
                    } else {
                        collaterals[loan].unaccountedRefundableCollateral = add(collaterals[loan].unaccountedRefundableCollateral, amount);
                    }

                    temporaryCollaterals[loan].refundableCollateral = sub(temporaryCollaterals[loan].refundableCollateral, amount);
                }

                collateralDeposits[loan][txidToOutputIndexToCollateralDepositIndex[_txid][_outputIndex]].finalized = true;

                _updateCollateralDepositFinalizedIndex(loan);
            } else { // In the case that 6 conf comes before 1 conf
                if (amount >= div(collateral(loan), 100)) { // Ensure amount is greater than 1% of collateral value
                    txidToOutputToRequestValid[_txid][_outputIndex] = true;
                    _setCollateralDeposit(loan, collateralDepositIndex[loan], amount, requestsDetails[_requestID].seizable);
                    collateralDeposits[loan][collateralDepositIndex[loan]].finalized = true;
                    txidToOutputIndexToCollateralDepositIndex[_txid][_outputIndex] = collateralDepositIndex[loan];
                    collateralDepositIndex[loan] = add(collateralDepositIndex[loan], 1);

                    if (requestsDetails[_requestID].seizable) {
                        collaterals[loan].seizableCollateral = add(collaterals[loan].seizableCollateral, amount);
                    } else {
                        collaterals[loan].refundableCollateral = add(collaterals[loan].refundableCollateral, amount);
                    }

                    _updateExistingRefundableCollateral(loan);
                    _updateCollateralDepositFinalizedIndex(loan);
                }
            }
        } else { // 1 confirmation
            if (amount >= div(collateral(loan), 100) && !txidToOutputToRequestValid[_txid][_outputIndex]) { // Ensure amount is greater than 1% of collateral value
                txidToOutputToRequestValid[_txid][_outputIndex] = true;
                _setCollateralDeposit(loan, collateralDepositIndex[loan], amount, requestsDetails[_requestID].seizable);
                txidToOutputIndexToCollateralDepositIndex[_txid][_outputIndex] = collateralDepositIndex[loan];
                collateralDepositIndex[loan] = add(collateralDepositIndex[loan], 1);

                if (requestsDetails[_requestID].seizable) {
                    temporaryCollaterals[loan].seizableCollateral = add(temporaryCollaterals[loan].seizableCollateral, amount);
                } else {
                    temporaryCollaterals[loan].refundableCollateral = add(temporaryCollaterals[loan].refundableCollateral, amount);
                }

                _updateExistingRefundableCollateral(loan);
            }
        }
    }

    function _setCollateralDeposit (bytes32 loan, uint256 collateralDepositIndex_, uint256 amount_, bool seizable_) private {
        collateralDeposits[loan][collateralDepositIndex_].amount = amount_;
        collateralDeposits[loan][collateralDepositIndex_].seizable = seizable_;
        collateralDeposits[loan][collateralDepositIndex_].expiry = now + ADD_COLLATERAL_EXPIRY;
    }

    function _updateExistingRefundableCollateral (bytes32 loan) private {
        if (add(collaterals[loan].seizableCollateral, temporaryCollaterals[loan].seizableCollateral) >= loans.minSeizableCollateralValue(loan) &&
            collaterals[loan].unaccountedRefundableCollateral != 0) {
            collaterals[loan].refundableCollateral = add(collaterals[loan].refundableCollateral, collaterals[loan].unaccountedRefundableCollateral);
            collaterals[loan].unaccountedRefundableCollateral = 0;
        }
    }

    function _updateCollateralDepositFinalizedIndex (bytes32 loan) private {
        // check if collateralDepositFinalizedIndex should be increased
        for (uint i = collateralDepositFinalizedIndex[loan]; i <= collateralDepositIndex[loan]; i++) {
            if (collateralDeposits[loan][i].finalized == true) {
                collateralDepositFinalizedIndex[loan] = add(collateralDepositFinalizedIndex[loan], 1);
            } else {
                break;
            }
        }
    }

    function requestSpv(bytes32 loan) external {
        require(msg.sender == address(loans), "Collateral.requestSpv: Only the loans contract can perform this");

        (, bytes32 refundableP2WSH) = p2wsh.getP2WSH(loan, false); // refundable collateral
        (, bytes32 seizableP2WSH) = p2wsh.getP2WSH(loan, true); // seizable collateral

        uint256 onePercentOfCollateral = div(collateral(loan), 100);

        uint256 refundRequestIDOneConf = onDemandSpv
            .request(hex"", abi.encodePacked(hex"220020", refundableP2WSH), uint64(onePercentOfCollateral), address(this), 1);
        uint256 refundRequestIDSixConf = onDemandSpv
            .request(hex"", abi.encodePacked(hex"220020", refundableP2WSH), uint64(onePercentOfCollateral), address(this), 6);

        uint256 seizeRequestIDOneConf = onDemandSpv
            .request(hex"", abi.encodePacked(hex"220020", seizableP2WSH), uint64(onePercentOfCollateral), address(this), 1);
        uint256 seizeRequestIDSixConf = onDemandSpv
            .request(hex"", abi.encodePacked(hex"220020", seizableP2WSH), uint64(onePercentOfCollateral), address(this), 6);

        loanRequests[loan].refundRequestIDOneConf = refundRequestIDOneConf;
        loanRequests[loan].refundRequestIDSixConf = refundRequestIDSixConf;
        loanRequests[loan].seizeRequestIDOneConf = seizeRequestIDOneConf;
        loanRequests[loan].seizeRequestIDSixConf = seizeRequestIDSixConf;

        requestsDetails[refundRequestIDOneConf].loan = loan;
        requestsDetails[refundRequestIDOneConf].p2wshAddress = refundableP2WSH;

        requestsDetails[refundRequestIDSixConf].loan = loan;
        requestsDetails[refundRequestIDSixConf].finalized = true;
        requestsDetails[refundRequestIDSixConf].p2wshAddress = refundableP2WSH;

        finalRequestToInitialRequest[refundRequestIDSixConf] = refundRequestIDOneConf;

        requestsDetails[seizeRequestIDOneConf].loan = loan;
        requestsDetails[seizeRequestIDOneConf].seizable = true;
        requestsDetails[seizeRequestIDOneConf].p2wshAddress = seizableP2WSH;

        requestsDetails[seizeRequestIDSixConf].loan = loan;
        requestsDetails[seizeRequestIDSixConf].seizable = true;
        requestsDetails[seizeRequestIDSixConf].finalized = true;
        requestsDetails[seizeRequestIDSixConf].p2wshAddress = seizableP2WSH;

        finalRequestToInitialRequest[seizeRequestIDSixConf] = seizeRequestIDOneConf;
    }

    function cancelSpv(bytes32 loan) external {
        require(msg.sender == address(loans), "Collateral.cancelSpv: Only the loans contract can perform this");

        require(onDemandSpv.cancelRequest(loanRequests[loan].refundRequestIDOneConf), "Collateral.cancelSpv: refundRequestIDOneConf failed");
        require(onDemandSpv.cancelRequest(loanRequests[loan].refundRequestIDSixConf), "Collateral.cancelSpv: refundRequestIDSixConf failed");
        require(onDemandSpv.cancelRequest(loanRequests[loan].seizeRequestIDOneConf), "Collateral.cancelSpv: seizeRequestIDOneConf failed");
        require(onDemandSpv.cancelRequest(loanRequests[loan].seizeRequestIDSixConf), "Collateral.cancelSpv: seizeRequestIDSixConf failed");
    }
}
