pragma solidity 0.5.10;

contract HotColdWallet {
    address funds;
    address loans;
    address sales;
    address public cold;
    address public hot;

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

    function isRequest(bytes memory data) private pure returns (bool) {
        return data[0] == hex"f5" && data[1] == hex"9b" && data[2] == hex"f2" && data[3] == hex"73";
    }

    function callFunds(bytes memory data) public {
        require(msg.sender == cold || (isRequest(data) && msg.sender == hot), "callFunds: Must be cold wallet or requesting with hot wallet");
        (bool success, bytes memory returnData) = funds.call.value(0)(data);
        require(success, string(returnData));
    }

    function callLoans(bytes calldata data) external {
        require(msg.sender == cold || msg.sender == hot, "callLoans: Must be hot or cold wallet");
        (bool success, bytes memory returnData) = loans.call.value(0)(data);
        require(success, string(returnData));
    }

    function callSales(bytes calldata data) external {
        require(msg.sender == cold || msg.sender == hot, "callSales: Must be hot or cold wallet");
        (bool success, bytes memory returnData) = sales.call.value(0)(data);
        require(success, string(returnData));
    }

    function changeHot(address newHot_) external {
        require(msg.sender == cold, "changeHot: Must be cold wallet");
        require(newHot_ != address(0), "changeHot: New hot address cannot be null");
        hot = newHot_;
    }
}
