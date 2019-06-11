pragma solidity >= 0.5.0 < 0.6.0;

import "./oraclizeAPI_0.5.sol";

contract OraclizeOracle is usingOraclize {
    
    uint128 val;
    uint32 public zzz;
    address med;

    constructor(address _med)
        public
    {
        med = _med;
        oraclize_setProof(proofType_Android | proofStorage_IPFS);
        update();
    }
    
    function peek() public view
        returns (bytes32,bool)
    {
        return (bytes32(uint(val)), now < zzz);
    }

    function read() public view
        returns (bytes32)
    {
        assert(now < zzz);
        return bytes32(uint(val));
    }

    function post(uint128 val_, uint32 zzz_, address med_) internal
    {
        val = val_;
        zzz = zzz_;
        (bool ret,) = med_.call(abi.encodeWithSignature("poke()"));
        ret;
    }
    
    function update()
        public
        payable
    {
        require(oraclize_getPrice("URL") <= address(this).balance);
        oraclize_query("URL", "json(https://api.pro.coinbase.com/products/BTC-USD/ticker).price");
    }

    function __callback(
        bytes32 _myid,
        string memory _result,
        bytes memory _proof
    )
        public
    {
        require(msg.sender == oraclize_cbAddress());
        post(uint128(safeParseInt(_result, 18)), uint32(now + 43200), med);
    }
}