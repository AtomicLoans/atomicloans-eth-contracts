// contract BTCPubKeys {
// 	string                         public tick = "BTC";
// 	mapping (address => bytes1)    public pubps; // User A Coin PubKey Prefixes
//     mapping (address => bytes32)   public pubss; // User A Coin PubKey Suffixes

//     function set(bytes1 pubp, bytes32 pubs) public {
//     	pubps[msg.sender] = pubp;
//     	pubss[msg.sender] = pubs;
//     }

//     function get(address addr) public view returns (bytes1, bytes32) {
//     	return (pubps[addr], pubss[addr]);
//     }
// }
