// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AIP Escrow — Moca Chain port (native MOCA)
/// @notice Conditional payment primitive for the Agent Internet Protocol.
///         Locks funds on task submission, releases to the agent (payee) on
///         completion, refunds the payer on failure, or lets the payer reclaim
///         after a deadline.
///
///         Port of the Solana Anchor `aip_escrow` program. Differences:
///           - value is native MOCA (msg.value), not an SPL/ERC-20 token, so
///             there is no mint, no token account and no approve step.
///           - the Solana vault PDA becomes funds held by this contract, keyed
///             by keccak256(taskId).
///         Authorization matches the Solana program exactly: the `authority`
///         (server) releases or refunds; the `payer` can cancel only after the
///         deadline; every transition requires the escrow to be Locked.
contract AipEscrow {
    // ------------------------------------------------------------------
    //  Types
    // ------------------------------------------------------------------

    /// None (0) means "no escrow" (default for an unused mapping slot).
    enum Status {
        None,
        Locked,
        Released,
        Refunded,
        Cancelled
    }

    struct Escrow {
        string taskId;
        address payer;
        address payee;
        address authority; // server wallet: can release / refund
        uint256 amount; // native MOCA, in wei
        uint64 deadline; // unix seconds; payer can cancel at/after this
        uint64 createdAt;
        Status status;
    }

    uint256 public constant MAX_TASK_ID_LEN = 64;

    // ------------------------------------------------------------------
    //  Storage
    // ------------------------------------------------------------------

    mapping(bytes32 => Escrow) private escrows;
    bytes32[] private allKeys; // append-only (escrows are never deleted, only transitioned)

    // ------------------------------------------------------------------
    //  Events
    // ------------------------------------------------------------------

    event EscrowInitialized(
        bytes32 indexed key,
        string taskId,
        address indexed payer,
        address indexed payee,
        address authority,
        uint256 amount,
        uint64 deadline
    );
    event EscrowReleased(bytes32 indexed key, string taskId, address indexed payee, uint256 amount);
    event EscrowRefunded(bytes32 indexed key, string taskId, address indexed payer, uint256 amount);
    event EscrowCancelled(bytes32 indexed key, string taskId, address indexed payer, uint256 amount);

    // ------------------------------------------------------------------
    //  Errors (mirror EscrowError)
    // ------------------------------------------------------------------

    error InvalidAmount();
    error TaskIdTooLong();
    error InvalidDeadline();
    error EscrowExists();
    error EscrowNotFound();
    error NotLocked();
    error Unauthorized();
    error DeadlineNotReached();
    error TransferFailed();
    error Reentrancy();

    // ------------------------------------------------------------------
    //  Reentrancy guard (manual, no external dependency)
    // ------------------------------------------------------------------

    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ------------------------------------------------------------------
    //  Key derivation
    // ------------------------------------------------------------------

    /// @dev Solana equivalent: PDA from ["escrow", task_id].
    function escrowKey(string memory taskId) public pure returns (bytes32) {
        return keccak256(abi.encode(taskId));
    }

    // ------------------------------------------------------------------
    //  Mutations
    // ------------------------------------------------------------------

    /// Lock msg.value for a task. payer = msg.sender. authority may release/refund.
    function initializeEscrow(string calldata taskId, address payee, address authority, uint64 deadline)
        external
        payable
    {
        if (msg.value == 0) revert InvalidAmount();
        uint256 len = bytes(taskId).length;
        if (len == 0 || len > MAX_TASK_ID_LEN) revert TaskIdTooLong();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        bytes32 key = escrowKey(taskId);
        if (escrows[key].status != Status.None) revert EscrowExists();

        escrows[key] = Escrow({
            taskId: taskId,
            payer: msg.sender,
            payee: payee,
            authority: authority,
            amount: msg.value,
            deadline: deadline,
            createdAt: uint64(block.timestamp),
            status: Status.Locked
        });
        allKeys.push(key);

        emit EscrowInitialized(key, taskId, msg.sender, payee, authority, msg.value, deadline);
    }

    /// Release locked funds to the payee. Only the authority can call.
    function releaseEscrow(string calldata taskId) external nonReentrant {
        Escrow storage e = _locked(taskId);
        if (msg.sender != e.authority) revert Unauthorized();

        e.status = Status.Released; // effect before interaction (CEI)
        uint256 amount = e.amount;
        address payee = e.payee;
        _send(payee, amount);

        emit EscrowReleased(escrowKey(taskId), taskId, payee, amount);
    }

    /// Refund locked funds to the payer. Only the authority can call.
    function refundEscrow(string calldata taskId) external nonReentrant {
        Escrow storage e = _locked(taskId);
        if (msg.sender != e.authority) revert Unauthorized();

        e.status = Status.Refunded;
        uint256 amount = e.amount;
        address payer = e.payer;
        _send(payer, amount);

        emit EscrowRefunded(escrowKey(taskId), taskId, payer, amount);
    }

    /// Reclaim funds to the payer after the deadline. Only the payer can call.
    function cancelEscrow(string calldata taskId) external nonReentrant {
        Escrow storage e = _locked(taskId);
        if (msg.sender != e.payer) revert Unauthorized();
        if (block.timestamp < e.deadline) revert DeadlineNotReached();

        e.status = Status.Cancelled;
        uint256 amount = e.amount;
        address payer = e.payer;
        _send(payer, amount);

        emit EscrowCancelled(escrowKey(taskId), taskId, payer, amount);
    }

    // ------------------------------------------------------------------
    //  Views
    // ------------------------------------------------------------------

    function getEscrow(string calldata taskId) external view returns (Escrow memory) {
        bytes32 key = escrowKey(taskId);
        if (escrows[key].status == Status.None) revert EscrowNotFound();
        return escrows[key];
    }

    function escrowStatus(string calldata taskId) external view returns (Status) {
        return escrows[escrowKey(taskId)].status;
    }

    function totalEscrows() external view returns (uint256) {
        return allKeys.length;
    }

    function getAllKeys() external view returns (bytes32[] memory) {
        return allKeys;
    }

    // ------------------------------------------------------------------
    //  Internal
    // ------------------------------------------------------------------

    /// Load an escrow that must exist and be Locked.
    function _locked(string calldata taskId) private view returns (Escrow storage e) {
        e = escrows[escrowKey(taskId)];
        if (e.status == Status.None) revert EscrowNotFound();
        if (e.status != Status.Locked) revert NotLocked();
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
