contract Medianizer {
	function push(uint256 amt) public;
    function read() view public returns (bytes32);
}