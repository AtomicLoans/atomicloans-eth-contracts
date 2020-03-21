pragma solidity 0.5.10;

/**
 * @title Atomic Loans Hot Cold Wallet Contract
 * @author Atomic Loans
 */
contract HotColdWallet {
    address funds;
    address loans;
    address sales;
    address public cold;
    address public hot;

    /**
     * @notice Construct a new HotColdWallet contract
     * @param funds_ The address of the funds contract
     * @param loans_ The address of the loans contract
     * @param sales_ The address of the sales contract
     * @param hot_ The address of the hot wallet
     * @param data Transaction data for creating fund
     */
    constructor (address funds_, address loans_, address sales_, address hot_, bytes memory data) public {
        funds = funds_;
        loans = loans_;
        sales = sales_;
        cold = msg.sender;
        hot = hot_;
        if (data.length > 0) {
            callFunds(data);
        }
    }

    /**
     * @notice Determine whether transaction data is for Funds request function
     * @param data Transaction data
     * @return Whether the transaction data is for Funds request function
     */
    function isRequest(bytes memory data) private pure returns (bool) {
        return data[0] == hex"f5" && data[1] == hex"9b" && data[2] == hex"f2" && data[3] == hex"73";
    }

    /**
     * @notice Call function in the Funds contract
     * @param data Transaction data
     */
    function callFunds(bytes memory data) public {
        require(msg.sender == cold || (isRequest(data) && msg.sender == hot), "callFunds: Must be cold wallet or requesting with hot wallet");
        (bool success, bytes memory returnData) = funds.call.value(0)(data);
        require(success, string(returnData));
    }

    /**
     * @notice Call function in the Loans contract
     * @param data Transaction data
     */
    function callLoans(bytes calldata data) external {
        require(msg.sender == cold || msg.sender == hot, "callLoans: Must be hot or cold wallet");
        (bool success, bytes memory returnData) = loans.call.value(0)(data);
        require(success, string(returnData));
    }

    /**
     * @notice Call function in the Sales contract
     * @param data Transaction data
     */
    function callSales(bytes calldata data) external {
        require(msg.sender == cold || msg.sender == hot, "callSales: Must be hot or cold wallet");
        (bool success, bytes memory returnData) = sales.call.value(0)(data);
        require(success, string(returnData));
    }

    /**
     * @notice Change hot wallet address
     * @param newHot_ Address of new hot wallet
     */
    function changeHot(address newHot_) external {
        require(msg.sender == cold, "changeHot: Must be cold wallet");
        require(newHot_ != address(0), "changeHot: New hot address cannot be null");
        hot = newHot_;
    }
}
