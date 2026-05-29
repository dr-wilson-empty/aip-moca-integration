// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AIP Agent Registry — Moca Chain port
/// @notice On-chain agent-card storage and discovery for the Agent Internet Protocol.
///         One wallet can register multiple agents, each with a unique agentId.
///
///         This is a direct port of the Solana Anchor `aip_registry` program.
///         The Solana PDA seeds ["agent", owner, agent_id] become the mapping key
///         keccak256(owner, agentId); rent-paying account creation becomes a struct
///         in storage. Field layout, length limits and authorization rules match the
///         Rust source of truth one-for-one.
contract AipRegistry {
    // ------------------------------------------------------------------
    //  Types (mirror the Solana program)
    // ------------------------------------------------------------------

    /// Tags match the Solana enum exactly: LLM=0, Task=1, Execution=2.
    enum AgentType {
        LLM,
        Task,
        Execution
    }

    struct Capability {
        string name; // 1..32 chars
        string description; // 0..64 chars
    }

    struct AgentRecord {
        address owner; // immutable, part of the key
        string agentId; // immutable, part of the key (1..32)
        string did; // canonical did string (format owned by the client, just stored here)
        string name;
        string endpoint;
        address walletAddress; // payout key; may differ from owner
        AgentType agentType;
        Capability[] capabilities; // max 8
        uint256 pricePerTask; // micro-USDC (6 decimals): representative base price for discovery
        string version;
        uint64 registeredAt; // unix seconds
        uint64 updatedAt; // unix seconds
        bool exists; // presence flag (Solana used account-exists; we use this)
    }

    // ------------------------------------------------------------------
    //  Limits (identical to the Solana program)
    // ------------------------------------------------------------------

    uint256 public constant MAX_AGENT_ID_LEN = 32;
    uint256 public constant MAX_DID_LEN = 100;
    uint256 public constant MAX_NAME_LEN = 64;
    uint256 public constant MAX_ENDPOINT_LEN = 200;
    uint256 public constant MAX_VERSION_LEN = 16;
    uint256 public constant MAX_CAPABILITIES = 8;
    uint256 public constant MAX_CAP_NAME_LEN = 32;
    uint256 public constant MAX_CAP_DESC_LEN = 64;

    // ------------------------------------------------------------------
    //  Storage
    // ------------------------------------------------------------------

    mapping(bytes32 => AgentRecord) private agents;

    // Enumeration: replaces Solana's getProgramAccounts scans so the marketplace
    // and DID resolver can list agents without an off-chain indexer.
    // Index mappings are 1-based (0 means "absent") to allow O(1) swap-and-pop removal.
    bytes32[] private allKeys;
    mapping(bytes32 => uint256) private allKeysIndex;
    mapping(address => bytes32[]) private ownerKeys;
    mapping(bytes32 => uint256) private ownerKeysIndex;

    // ------------------------------------------------------------------
    //  Events
    // ------------------------------------------------------------------

    event AgentRegistered(bytes32 indexed key, address indexed owner, string agentId, string did);
    event AgentUpdated(bytes32 indexed key, address indexed owner, string agentId);
    event AgentDeregistered(bytes32 indexed key, address indexed owner, string agentId);

    // ------------------------------------------------------------------
    //  Errors (mirror RegistryError)
    // ------------------------------------------------------------------

    error AgentIdInvalid();
    error DidTooLong();
    error NameTooLong();
    error EndpointTooLong();
    error VersionTooLong();
    error TooManyCapabilities();
    error CapabilityNameInvalid();
    error CapabilityDescriptionTooLong();
    error Unauthorized();
    error AgentAlreadyExists();
    error AgentNotFound();

    // ------------------------------------------------------------------
    //  Key derivation (PDA equivalent)
    // ------------------------------------------------------------------

    /// @dev Solana equivalent: PublicKey.findProgramAddressSync(["agent", owner, agentId]).
    ///      abi.encode (not encodePacked) keeps owner/agentId unambiguous so no two
    ///      distinct pairs can collide.
    function agentKey(address owner, string memory agentId) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, agentId));
    }

    // ------------------------------------------------------------------
    //  Mutations
    // ------------------------------------------------------------------

    /// Register a new agent. agentId is unique per owner and immutable afterwards.
    function registerAgent(
        string calldata agentId,
        string calldata did,
        string calldata name,
        string calldata endpoint,
        address walletAddress,
        AgentType agentType,
        Capability[] calldata capabilities,
        uint256 pricePerTask,
        string calldata version
    ) external {
        _validateAgentId(agentId);
        _validateDid(did);
        _validateCommonMetadata(name, endpoint, version);
        _validateCapabilities(capabilities);

        bytes32 key = agentKey(msg.sender, agentId);
        if (agents[key].exists) revert AgentAlreadyExists();

        AgentRecord storage rec = agents[key];
        rec.owner = msg.sender;
        rec.agentId = agentId;
        rec.did = did;
        rec.name = name;
        rec.endpoint = endpoint;
        rec.walletAddress = walletAddress;
        rec.agentType = agentType;
        for (uint256 i = 0; i < capabilities.length; i++) {
            rec.capabilities.push(capabilities[i]);
        }
        rec.pricePerTask = pricePerTask;
        rec.version = version;
        rec.registeredAt = uint64(block.timestamp);
        rec.updatedAt = uint64(block.timestamp);
        rec.exists = true;

        allKeysIndex[key] = allKeys.length + 1;
        allKeys.push(key);
        ownerKeysIndex[key] = ownerKeys[msg.sender].length + 1;
        ownerKeys[msg.sender].push(key);

        emit AgentRegistered(key, msg.sender, agentId, did);
    }

    /// Update an existing agent. Only the owner may call; agentId and did are immutable.
    function updateAgent(
        string calldata agentId,
        string calldata name,
        string calldata endpoint,
        address walletAddress,
        AgentType agentType,
        Capability[] calldata capabilities,
        uint256 pricePerTask,
        string calldata version
    ) external {
        bytes32 key = agentKey(msg.sender, agentId);
        AgentRecord storage rec = agents[key];
        if (!rec.exists) revert AgentNotFound();
        // The key is derived from msg.sender so only the owner can address their record,
        // but we assert it explicitly to mirror the Solana owner constraint.
        if (rec.owner != msg.sender) revert Unauthorized();

        _validateCommonMetadata(name, endpoint, version);
        _validateCapabilities(capabilities);

        rec.name = name;
        rec.endpoint = endpoint;
        rec.walletAddress = walletAddress;
        rec.agentType = agentType;
        delete rec.capabilities;
        for (uint256 i = 0; i < capabilities.length; i++) {
            rec.capabilities.push(capabilities[i]);
        }
        rec.pricePerTask = pricePerTask;
        rec.version = version;
        rec.updatedAt = uint64(block.timestamp);

        emit AgentUpdated(key, msg.sender, agentId);
    }

    /// Deregister an agent: removes the record and its enumeration entries.
    function deregisterAgent(string calldata agentId) external {
        bytes32 key = agentKey(msg.sender, agentId);
        AgentRecord storage rec = agents[key];
        if (!rec.exists) revert AgentNotFound();
        if (rec.owner != msg.sender) revert Unauthorized();

        _swapPop(allKeys, allKeysIndex, key);
        _swapPop(ownerKeys[msg.sender], ownerKeysIndex, key);
        delete agents[key];

        emit AgentDeregistered(key, msg.sender, agentId);
    }

    // ------------------------------------------------------------------
    //  Views (replace the off-chain getProgramAccounts queries)
    // ------------------------------------------------------------------

    function getAgent(address owner, string calldata agentId) external view returns (AgentRecord memory) {
        bytes32 key = agentKey(owner, agentId);
        if (!agents[key].exists) revert AgentNotFound();
        return agents[key];
    }

    function getAgentByKey(bytes32 key) external view returns (AgentRecord memory) {
        if (!agents[key].exists) revert AgentNotFound();
        return agents[key];
    }

    function isAgentOnChain(address owner, string calldata agentId) external view returns (bool) {
        return agents[agentKey(owner, agentId)].exists;
    }

    function totalAgents() external view returns (uint256) {
        return allKeys.length;
    }

    function getAllKeys() external view returns (bytes32[] memory) {
        return allKeys;
    }

    function getKeysByOwner(address owner) external view returns (bytes32[] memory) {
        return ownerKeys[owner];
    }

    /// Full records for one owner (small N — one wallet's agents).
    function getAgentsByOwner(address owner) external view returns (AgentRecord[] memory list) {
        bytes32[] storage keys = ownerKeys[owner];
        list = new AgentRecord[](keys.length);
        for (uint256 i = 0; i < keys.length; i++) {
            list[i] = agents[keys[i]];
        }
    }

    /// Paginated global listing for the marketplace. `limit` is clamped to the tail.
    function getAgentsPaged(uint256 offset, uint256 limit) external view returns (AgentRecord[] memory page) {
        uint256 total = allKeys.length;
        if (offset >= total) return new AgentRecord[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new AgentRecord[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = agents[allKeys[i]];
        }
    }

    // ------------------------------------------------------------------
    //  Internal helpers
    // ------------------------------------------------------------------

    function _validateAgentId(string calldata agentId) private pure {
        uint256 len = bytes(agentId).length;
        if (len == 0 || len > MAX_AGENT_ID_LEN) revert AgentIdInvalid();
    }

    function _validateDid(string calldata did) private pure {
        if (bytes(did).length > MAX_DID_LEN) revert DidTooLong();
    }

    function _validateCommonMetadata(string calldata name, string calldata endpoint, string calldata version)
        private
        pure
    {
        if (bytes(name).length > MAX_NAME_LEN) revert NameTooLong();
        if (bytes(endpoint).length > MAX_ENDPOINT_LEN) revert EndpointTooLong();
        if (bytes(version).length > MAX_VERSION_LEN) revert VersionTooLong();
    }

    function _validateCapabilities(Capability[] calldata caps) private pure {
        if (caps.length > MAX_CAPABILITIES) revert TooManyCapabilities();
        for (uint256 i = 0; i < caps.length; i++) {
            uint256 nameLen = bytes(caps[i].name).length;
            if (nameLen == 0 || nameLen > MAX_CAP_NAME_LEN) revert CapabilityNameInvalid();
            if (bytes(caps[i].description).length > MAX_CAP_DESC_LEN) revert CapabilityDescriptionTooLong();
        }
    }

    /// O(1) removal from a key array + its 1-based index mapping.
    function _swapPop(bytes32[] storage arr, mapping(bytes32 => uint256) storage idx, bytes32 key) private {
        uint256 oneBased = idx[key];
        uint256 lastPos = arr.length - 1;
        bytes32 lastKey = arr[lastPos];
        arr[oneBased - 1] = lastKey;
        idx[lastKey] = oneBased;
        arr.pop();
        delete idx[key];
    }
}
