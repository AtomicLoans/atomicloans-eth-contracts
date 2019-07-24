import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

import './Loans.sol';
import './Currency.sol';
import './Vars.sol';
import './DSMath.sol';

pragma solidity ^0.5.8;

contract Funds is DSMath {
    Loans loans;

    mapping (address => bytes32[]) public sechs;  // User secret hashes
    mapping (address => uint256)   public sechi;  // User secret hash index

    mapping (address => bytes)     public pubks;  // User A Coin PubKeys
    
    mapping (bytes32 => Fund)      public funds;  
    uint256                        public fundi;

    mapping (address => bool)      public tokas;  // Is ERC20 Token Approved

    bool on; // Ensure that Loans contract is created

    struct Fund {
        address  own;   // Loan Fund Owner (Lender)
        uint256  mila;  // Min Loan Amount
        uint256  mala;  // Max Loan Amount
        uint256  mild;  // Min Loan Duration
        uint256  mald;  // Max Loan Duration
        uint256  lint;  // Interest Rate in RAY
        uint256  lpen;  // Liquidation Penalty Rate in RAY
        uint256  lfee;  // Optional Automation Fee in RAY
        uint256  rat;   // Liquidation Ratio in RAY
        address  agent; // Optional Automator Agent
        uint256  bal;   // Locked amount in fund (in TOK)
        ERC20    tok;   // Debt Token
        Currency cur;   // Currency info
        Vars     vars;  // Variable contract
    }

    function setLoans(address loans_) public {
        require(!on);
        loans = Loans(loans_);
        on = true;
    }

    function own(bytes32 fund)   public view returns (address) {
        return funds[fund].own;
    }

    function mila(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mila;
    }

    function mala(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mala;
    }

    function mild(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mild;
    }

    function mald(bytes32 fund)  public view returns (uint256) {
        return funds[fund].mald;
    }

    function lint(bytes32 fund)  public view returns (uint256) {
        return funds[fund].lint;
    }

    function lpen(bytes32 fund)  public view returns (uint256) {
        return funds[fund].lpen;
    }

    function lfee(bytes32 fund)  public view returns (uint256) {
        return funds[fund].lfee;
    }

    function rat(bytes32 fund)   public view returns (uint256) {
        return funds[fund].rat;
    }

    function agent(bytes32 fund) public view returns (address) {
        return funds[fund].agent;
    }

    function bal(bytes32 fund)   public view returns (uint256) {
        return funds[fund].bal;
    }

    function tok(bytes32 fund)   public view returns (address) {
        return address(funds[fund].tok);
    }

    function cur(bytes32 fund)   public view returns (address) {
        return address(funds[fund].cur);
    }

    function vars(bytes32 fund)  public view returns (address) {
        return address(funds[fund].vars);
    }

    function open(
        uint256  mila_,  // Min Loan Amount
        uint256  mala_,  // Max Loan Amount
        uint256  mild_,  // Min Loan Duration
        uint256  mald_,  // Max Loan Duration
        uint256  rat_,   // Liquidation Ratio
        uint256  lint_,  // Interest Rate
        uint256  lpen_,  // Liquidation Penalty Rate
        uint256  lfee_,  // Optional Automation Fee Rate
        address  agent_, // Optional Address Automated Agent
        ERC20    tok_,   // Debt Token
        Currency cur_,   // Currency contract
        Vars     vars_   // Variable contract
    ) public returns (bytes32 fund) {
        fundi = add(fundi, 1);
        fund = bytes32(fundi);
        funds[fund].own   = msg.sender;
        funds[fund].mila  = mila_;
        funds[fund].mala  = mala_;
        funds[fund].mild  = mild_;
        funds[fund].mald  = mald_;
        funds[fund].lint  = lint_;
        funds[fund].lpen  = lpen_;
        funds[fund].lfee  = lfee_;
        funds[fund].rat   = rat_;
        funds[fund].tok   = tok_;
        funds[fund].cur   = cur_;
        funds[fund].vars  = vars_;
        funds[fund].agent = agent_;

        if (tokas[address(tok_)] == false) {
            require(tok_.approve(address(loans), 2**256-1));
            tokas[address(tok_)] = true;
        }
    }

    function push(bytes32 fund, uint256 amt) public { // Push funds to Loan Fund
        // require(msg.sender == own(fund) || msg.sender == address(loans)); // NOTE: this require is not necessary. Anyone can fund someone elses loan fund
        require(funds[fund].tok.transferFrom(msg.sender, address(this), amt));
        funds[fund].bal = add(funds[fund].bal, amt);
    }

    function gen(bytes32[] memory sechs_) public { // Generate secret hashes for Loan Fund
        for (uint i = 0; i < sechs_.length; i++) {
            sechs[msg.sender].push(sechs_[i]);
        }
    }

    function set(bytes memory pubk) public { // Set PubKey for Fund
        pubks[msg.sender] = pubk;
    }

    function set(        // Set Loan Fund details
        bytes32  fund,   // Loan Fund Index
        uint256  mila_,  // Min Loan Amount
        uint256  mala_,  // Max Loan Amount
        uint256  mild_,  // Min Loan Duration
        uint256  mald_,  // Max Loan Duration
        uint256  lint_,  // Interest Rate in RAY
        uint256  lpen_,  // Liquidation Penalty Rate in RAY
        uint256  lfee_,  // Optional Automation Fee in RAY
        uint256  rat_,   // Liquidation Ratio in RAY
        address  agent_  // Optional Automator Agent)
    ) public {
        require(msg.sender == own(fund));
        funds[fund].mila  = mila_;
        funds[fund].mala  = mala_;
        funds[fund].mild  = mild_;
        funds[fund].mald  = mald_;
        funds[fund].lint  = lint_;
        funds[fund].lpen  = lpen_;
        funds[fund].lfee  = lfee_;
        funds[fund].rat   = rat_;
        funds[fund].agent = agent_;
    }

    function req(                 // Request Loan
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_,  // Loan Duration in seconds
        bytes32[4] memory sechs_, // Secret Hash A1 & A2
        bytes      memory pubk_   // Pubkey
    ) public returns (bytes32 loani) {
        require(msg.sender != own(fund));
        require(amt_       <= bal(fund));
        require(amt_       >= mila(fund));
        require(amt_       <= mala(fund));
        require(lodu_      >= mild(fund));
        require(lodu_      <= mald(fund));

        loani = lopen(fund, amt_, col_, lodu_);
        lsech(fund, loani, sechs_, pubk_);
        loans.push(loani);
    }

    function pull(bytes32 fund, uint256 amt) public { // Pull funds from Loan Fund
        require(msg.sender == own(fund));
        require(bal(fund)  >= amt);
        require(funds[fund].tok.transfer(own(fund), amt));
        funds[fund].bal = sub(funds[fund].bal, amt);
    }

    function calc(uint256 amt, uint256 rate, uint256 lodu) public pure returns (uint256) { // Calculate interest
        return sub(rmul(amt, rpow(rate, lodu)), amt);
    }

    function lopen(               // Private Open Loan
        bytes32           fund,   // Fund Index
        uint256           amt_,   // Loan Amount
        uint256           col_,   // Collateral Amount in satoshis
        uint256           lodu_   // Loan Duration in seconds
    ) private returns (bytes32 loani) {
        loani = loans.open(
            now + lodu_,
            [ msg.sender, own(fund), funds[fund].agent],
            [ amt_, calc(amt_, lint(fund), lodu_), calc(amt_, lpen(fund), lodu_), calc(amt_, lfee(fund), lodu_), col_, funds[fund].rat],
            funds[fund].tok,
            funds[fund].cur,
            funds[fund].vars,
            fund
        );
    }

    function lsech(                // Loan Set Secret Hashes
        bytes32 fund,              // Fund Index
        bytes32 loan,              // Loan Index
        bytes32[4] memory sechs_,  // 4 Secret Hashes
        bytes memory pubk_         // Public Key
    ) private { // Loan set Secret Hash and PubKey
        loans.setSechs(
            loan,
            sechs_,
            gsech(own(fund)),
            gsech(agent(fund)),
            pubk_,
            pubks[own(fund)]
        );
    }

    function gsech(address addr) private view returns (bytes32[4] memory) { // Get 4 secrethashes for loan
        require((sechs[addr].length - sechi[addr]) >= 4);
        return [ sechs[addr][add(sechi[addr], 0)], sechs[addr][add(sechi[addr], 1)], sechs[addr][add(sechi[addr], 2)], sechs[addr][add(sechi[addr], 3)] ];
    }
}
