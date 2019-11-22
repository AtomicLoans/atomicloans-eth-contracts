pragma solidity ^0.5.10;

interface ISPVConsumer {
    function spv(
        bytes32 _txid,
        bytes calldata _vin,
        bytes calldata _vout,
        uint256 _requestID,
        uint8 _inputIndex,
        uint8 _outputIndex) external;
}

interface IOnDemandSPV {
    event NewProofRequest (
        address indexed _requester,
        uint256 indexed _requestID,
        uint64 _paysValue,
        bytes _spends,
        bytes _pays
    );
    event SubscriptionExpired(address indexed _owner);
    event RequestClosed(uint256 indexed _requestID);
    event RequestFilled(bytes32 indexed _txid, uint256 indexed _requestID);

    /// @notice                 Subscribe to a feed of Bitcoin txns matching a request
    /// @dev                    The request can be a spent utxo and/or a created utxo
    /// @param  _spends         An outpoint that must be spent in acceptable txns (optional)
    /// @param  _pays           A scripthash that must be paid in acceptable txns (optional)
    /// @param  _paysValue      A minimum value that must be paid to the scripthash (optional)
    /// @param  _consumer       The address of a ISPVConsumer exposing spv
    /// @return                 True if succesful, error otherwise
    function request(
        bytes calldata _spends,
        bytes calldata _pays,
        uint64 _paysValue,
        address _consumer
    ) external returns (uint256);

    /// @notice                 Cancel a subscription to a request, retrieve the deposit
    /// @dev                    10% of the deposit is withheld as fee for service
    /// @param  _requestID       The id of the request to cancel
    /// @return                 True if succesful, error otherwise
    function cancelSubscription(uint256 _requestID) external returns (bool);

    /// @notice                 Provide a proof of a tx that satisfies some request
    /// @dev                    The caller must specify which inputs, which outputs, and which request
    /// @param  _header         The header containing the merkleroot committing to the tx
    /// @param  _proof          The merkle proof intermediate nodes
    /// @param  _version        The tx version, always the first 4 bytes of the tx
    /// @param  _locktime       The tx locktime, always the last 4 bytes of the tx
    /// @param  _index          The index of the tx in the merkle tree's leaves
    /// @param  _reqIndices  The input and output index to check against the request, packed
    /// @param  _vin            The tx input vector
    /// @param  _vout           The tx output vector
    /// @param  _requestID       The id of the request that has been triggered
    /// @return                 True if succesful, error otherwise
    function provideProof(
        bytes calldata _header,
        bytes calldata _proof,
        bytes4 _version,
        bytes4 _locktime,
        uint256 _index,
        uint16 _reqIndices,
        bytes calldata _vin,
        bytes calldata _vout,
        uint256 _requestID
    ) external returns (bool);
}
