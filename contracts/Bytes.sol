pragma solidity ^0.5.8;

contract Bytes {
    function conc(bytes memory a, bytes memory b) public pure returns (bytes memory c) {
        uint alen = a.length;
        uint totallen = alen + b.length;
        uint loopsa = (a.length + 31) / 32;
        uint loopsb = (b.length + 31) / 32;
        assembly {
            let m := mload(0x40)
            mstore(m, totallen)
            for {  let i := 0 } lt(i, loopsa) { i := add(1, i) } { mstore(add(m, mul(32, add(1, i))), mload(add(a, mul(32, add(1, i))))) }
            for {  let i := 0 } lt(i, loopsb) { i := add(1, i) } { mstore(add(m, add(mul(32, add(1, i)), alen)), mload(add(b, mul(32, add(1, i))))) }
            mstore(0x40, add(m, add(32, totallen)))
            c := m
        }
    }

    function scriptNumSize(uint256 i) public view returns (uint256) {
        if      (i > 0x7fffffff) { return 5; }
        else if (i > 0x7fffff  ) { return 4; }
        else if (i > 0x7fff    ) { return 3; }
        else if (i > 0x7f      ) { return 2; }
        else if (i > 0x00      ) { return 1; }
        else                     { return 0; }
    }

    function scriptNumSizeHex(uint256 i) public view returns (bytes memory) {
        return toBytes(scriptNumSize(i));
    }

    function toBytes(uint256 x) public view returns (bytes memory b) {
        uint a = scriptNumSize(x);
        b = new bytes(a);
        for (uint i = 0; i < a; i++) {
            b[i] = byte(uint8(x / (2**(8*(a - 1 - i)))));
        }
    }

    function scriptNumEncode(uint256 num) public view returns (bytes memory) {
        uint a = scriptNumSize(num);
        bytes memory b = toBytes(num);
        for (uint i = 0; i < (a/2); i++) {
            byte c = b[i];
            b[i] = b[a - i - 1];
            b[a - i - 1] = c;
        }
        return b;
    }
}