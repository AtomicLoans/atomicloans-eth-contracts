import './Bytes.sol';
import './Loans.sol';

pragma solidity ^0.5.8;

contract P2SH is Bytes {
	Loans loans;

	constructor(Loans loans_) public {
		loans = loans_;
	}

	function sechis(bytes32 loan) public view returns (bytes32 a, bytes32 b, bytes32 c) {
		a = loans.sechi(loan, 'A');
		b = loans.sechi(loan, 'B');
		c = loans.sechi(loan, 'C');
	}

	function pubks(bytes32 loan) public view returns (bytes memory a, bytes memory b, bytes memory c) {
		a = loans.pubk(loan, 'A');
		b = loans.pubk(loan, 'B');
		c = loans.pubk(loan, 'C');
	}

	function loanPeriodP2SH(bytes32 loan, bytes memory script) public view returns (bytes memory) {
		(, bytes32 sechB1_, bytes32 sechC1_,) = loans.sechs(loan);

		bytes memory result = conc(conc(conc(conc(conc(conc(conc(conc(
			hex"63820120a169a820", // OP_IF OP_SIZE OP_PUSHDATA(1) OP_PUSHDATA(32) OP_LESSTHANOREQUAL OP_VERIFY OP_SHA256 OP_PUSHDATA(32)
        abi.encodePacked(sechB1_)),
        hex"877c820120a169a820"), // OP_EQUAL OP_SWAP OP_SIZE OP_PUSHDATA(1) OP_PUSHDATA(32) OP_LESSTHANOREQUAL OP_VERIFY OP_SHA256 OP_PUSHDATA(32)
        abi.encodePacked(sechC1_)),
        hex"879351a26976a914"), // OP_EQUAL OP_ADD OP_1 OP_GREATERTHANOREQUAL OP_VERIFY OP_DUP OP_HASH160 OP_PUSHDATA(20)
        abi.encodePacked(ripemd160(abi.encodePacked(sha256(loans.pubk(loan, 'A')))))),
        hex"88ac67"), // OP_EQUALVERIFY OP_CHECKSIG OP_ELSE
			script),
			hex"68"); // OP_ENDIF

		return result;
	}

	function biddingPeriodSechP2SH(bytes32 loan) public view returns (bytes memory) {
		(bytes32 sechA2_, bytes32 sechB2_, bytes32 sechC2_) = sechis(loan);

		bytes memory result = conc(conc(conc(conc(conc(conc(conc(conc(conc(
			hex"820120a169a820", // OP_SIZE OP_PUSHDATA(1) OP_PUSHDATA(32) OP_LESSTHANOREQUAL OP_VERIFY OP_SHA256 OP_PUSHDATA(32)
			abi.encodePacked(sechA2_)),
      hex"877c820120a169a820"), // OP_EQUAL OP_SWAP OP_SIZE OP_PUSHDATA(1) OP_PUSHDATA(32) OP_LESSTHANOREQUAL OP_VERIFY OP_SHA256 OP_PUSHDATA(32)
      abi.encodePacked(sechB2_)),
      hex"87937c820120a169a820"), // OP_EQUAL OP_ADD OP_SWAP OP_SIZE OP_PUSHDATA(1) OP_PUSHDATA(32) OP_LESSTHANOREQUAL OP_VERIFY OP_SHA256 OP_PUSHDATA(32)
      abi.encodePacked(sechC2_)),
      hex"879352a269"), // OP_EQUAL OP_ADD OP_2 OP_GREATERTHANOREQUAL OP_VERIFY
      scriptNumSizeHex(loans.loex(loan))),
      scriptNumEncode(loans.loex(loan))),
      hex"b175"); // OP_CHECKLOCKTIMEVERIFY OP_DROP

		return result;
	}

	function biddingPeriodSigP2SH(bytes32 loan) public view returns (bytes memory) {
		(bytes memory bpubk_, bytes memory lpubk_, bytes memory apubk_) = pubks(loan);

		bytes memory result = conc(conc(conc(conc(conc(conc(conc(
      hex"52", // OP_2
			toBytes(bpubk_.length)),
      bpubk_),
      toBytes(lpubk_.length)),
      lpubk_),
      toBytes(apubk_.length)),
      apubk_),
      hex"53ae"); // OP_3 CHECKMULTISIG

		return result;
	}

	function biddingPeriodP2SH(bytes32 loan, bytes memory script) public view returns (bytes memory) {
		bytes memory result = conc(conc(conc(conc(conc(
			hex"63", // OP_IF
			biddingPeriodSechP2SH(loan)),
			biddingPeriodSigP2SH(loan)),
			hex"67"), // OP_ELSE
			script),
			hex"68"); // OP_ENDIF

		return result;
	}

	function seizurePeriodSechP2SH(bytes32 loan) public view returns (bytes memory) {
		(bytes32 sechA1_, , ,) = loans.sechs(loan);

		bytes memory result = conc(conc(conc(conc(
			scriptNumSizeHex(loans.biex(loan)),
      scriptNumEncode(loans.biex(loan))),
      hex"b17582012088a820"), // OP_CHECKLOCKTIMEVERIFY OP_DROP OP_SIZE OP_PUSHDATA(1) OP_PUSHDATA(32) OP_EQUALVERIFY OP_SHA256 OP_PUSHDATA(32)
      abi.encodePacked(sechA1_)),
      hex"88"); // OP_EQUALVERIFY

		return result;
	}

	function seizurePeriodP2SH(bytes32 loan, bytes memory script, bool sez) public view returns (bytes memory) {
		(bytes memory bpubk_, bytes memory lpubk_, ) = pubks(loan);

		bytes memory pubk;

		if (sez) {
			pubk = lpubk_;
		} else {
			pubk = bpubk_;
		}

		bytes memory result = conc(conc(conc(conc(conc(conc(
			hex"63", // OP_IF
			seizurePeriodSechP2SH(loan)),
      hex"76a914"), // OP_DUP OP_HASH160 OP_PUSHDATA(20)
      abi.encodePacked(ripemd160(abi.encodePacked(sha256(pubk))))),
      hex"88ac67"), // OP_EQUALVERIFY OP_CHECKSIG OP_ELSE
			script),
			hex"68"); // OP_ENDIF

		return result;
	}

	function refundablePeriodP2SH(bytes32 loan) public view returns (bytes memory) {
		(bytes memory bpubk_, , ) = pubks(loan);

		bytes memory result = conc(conc(conc(conc(
			scriptNumSizeHex(loans.siex(loan)),
      scriptNumEncode(loans.siex(loan))),
      hex"b17576a914"), // OP_CHECKLOCKTIMEVERIFY OP_DROP OP_DUP OP_HASH160 OP_PUSHDATA(20)
      abi.encodePacked(ripemd160(abi.encodePacked(sha256(bpubk_))))),
      hex"88ac"); // OP_EQUALVERIFY OP_CHECKSIG

		return result;
	}

	function getP2SH(bytes32 loan, bool sez) public view returns (bytes memory, bytes20) {
		bytes memory script = loanPeriodP2SH(loan, biddingPeriodP2SH(loan, seizurePeriodP2SH(loan, refundablePeriodP2SH(loan), sez)));
		bytes20 pubkh = ripemd160(abi.encodePacked(sha256(script)));

		return (script, pubkh);
  }
}