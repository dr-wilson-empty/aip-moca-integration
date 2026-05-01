# The `did:aip` DID Method Specification v1.0

**Status:** Draft
**Editor's Draft Date:** 2026-05-02
**Editors:** AIP Working Group
**Latest Editor's Draft:** https://github.com/dr-wilson-empty/aip-website/blob/main/standards/did-aip-method-spec.md
**Implementation Reference:** [AIP Agent Registry Program](https://github.com/dr-wilson-empty/aip-website/blob/main/programs/aip-escrow/programs/aip-registry/src/lib.rs) - Solana Devnet program ID `CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc`
**Conformance Target:** [W3C DID Core 1.0](https://www.w3.org/TR/did-core/)

---

## Abstract

This document specifies the `did:aip` Decentralized Identifier (DID) method, a Solana-anchored DID scheme designed for autonomous AI agents operating under the Agent Internet Protocol (AIP). Each `did:aip` identifier is mathematically and cryptographically bound to a Program Derived Address (PDA) on the Solana blockchain via the AIP Agent Registry Program, yielding globally unique, tamper-evident, self-sovereign agent identities without reliance on any centralized authority. DID Documents are deterministically reconstructed from on-chain account state and complemented by an off-chain Agent Card describing the agent's capabilities, endpoints, and economic terms.

---

## Status of This Document

This is a working draft of the `did:aip` Method Specification. It is intended to be submitted to the W3C DID Specification Registries (https://www.w3.org/TR/did-spec-registries/) once stabilized. Until accepted, all identifiers, account layouts, and resolution behavior described herein are subject to revision.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**, and **REQUIRED** in this document are to be interpreted as described in [RFC 2119] and [RFC 8174] when, and only when, they appear in all capitals.

---

## 1. Introduction

### 1.1 Motivation

Autonomous software agents - large language model (LLM) workers, task coordinators, and on-chain execution bots - require an identity primitive that is:

1. **Sovereign** - controlled cryptographically by the agent's operator, with no central registrar.
2. **Globally unique** - collision-free across all networks and operators without coordination.
3. **Tamper-evident** - every state transition is publicly auditable on a public ledger.
4. **Resolvable** - any party can retrieve the agent's metadata and capability advertisement using only the DID string.
5. **Distinct from the operator's wallet** - a single human or organization may operate many agents, each with its own identity and economic profile.

Existing wallet addresses (raw Ed25519 public keys) satisfy (1) and (3) but fail (2) when an operator runs multiple agents and fail (5) entirely. Centralized agent registries fail (1). The `did:aip` method composes a Solana PDA (`["agent", owner, agent_id]`) with the W3C DID abstraction to provide all five properties.

### 1.2 Design Goals

- **Zero-trust resolution.** A DID Document MUST be reconstructible by any party from only the DID string and a Solana RPC endpoint.
- **Constant-cost issuance.** Registering a new agent MUST require only one Solana transaction and the rent-exempt SOL balance for the PDA.
- **Operator multiplicity.** A single owning wallet MUST be able to control an unbounded number of `did:aip` identifiers, distinguished by their `agent_id`.
- **Off-chain extensibility.** The on-chain record MUST remain compact; richer metadata (full capability schemas, pricing tiers, signed claims) lives in the Agent Card retrieved from the agent's `endpoint`.

---

## 2. Terminology

This specification uses the following terms in addition to those defined by [DID Core 1.0]:

| Term | Definition |
|------|------------|
| **AIP Registry Program** | The Solana program (ID `CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc` on Devnet) that owns and validates all `AgentRecord` accounts. |
| **AgentRecord** | A Borsh-serialized account, owned by the AIP Registry Program, holding the on-chain state of a single `did:aip` identifier. |
| **PDA (Program Derived Address)** | A Solana account address deterministically derived from a program ID and a seed sequence; not associated with any private key. |
| **Owner Wallet** | The Ed25519 keypair whose public key was the signer of the `register_agent` instruction; also the only authorized signer for `update_agent` and `deregister_agent`. |
| **Agent Card** | A JSON document, served at the agent's `endpoint`, advertising the agent's capabilities, pricing, and authentication parameters. Conformant to the schema in §A.1 of the corresponding SIMD. |

---

## 3. The `did:aip` Method

### 3.1 Method Name

The method name that identifies this DID method is: `aip`.

A DID conforming to this specification **MUST** begin with the prefix `did:aip:`.

### 3.2 Method-Specific Identifier (Normative)

The method-specific identifier is composed of the base58-encoded Ed25519 public key of the Owner Wallet, a colon, and the agent's owner-scoped slug (`agent_id`).

```abnf
did-aip            = "did:aip:" owner-pubkey ":" agent-id
owner-pubkey       = 32*44 base58char            ; Ed25519 pubkey, base58 (Bitcoin alphabet)
agent-id           = 1*32 agent-id-char          ; owner-scoped slug
agent-id-char      = ALPHA / DIGIT / "-" / "_"
base58char         = %x31-39 / %x41-48 / %x4A-4E / %x50-5A / %x61-6B / %x6D-7A
                   ; "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
```

Implementations **MUST** reject any DID where:
- the `owner-pubkey` segment is not a valid base58 encoding of a 32-byte Ed25519 public key, or
- the `agent-id` segment exceeds 32 octets when UTF-8 encoded, or
- the `agent-id` segment contains any character outside the `agent-id-char` production above.

### 3.3 Examples

```
did:aip:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:ada-research-001
did:aip:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM:scribe
```

---

## 4. DID Document Construction

### 4.1 Required Properties (Normative)

A resolver **MUST** construct the DID Document by deserializing the corresponding `AgentRecord` PDA account (see §6) and emitting a JSON-LD document containing **at minimum** the following properties:

| DID Document Property | Source in `AgentRecord` |
|-----------------------|-------------------------|
| `id` | The DID string supplied to the resolver. |
| `controller` | `"did:aip:" + base58(record.owner) + ":" + record.agent_id` (always self-controlled - see §4.4). |
| `verificationMethod` | One entry derived from `record.wallet_address`. |
| `authentication` | A reference to the `verificationMethod` above. |
| `assertionMethod` | A reference to the `verificationMethod` above. |
| `service` | One entry of type `AIPAgentEndpoint` derived from `record.endpoint`. |

### 4.2 `verificationMethod`

The single canonical verification method **MUST** be constructed as:

```json
{
  "id": "<DID>#key-1",
  "type": "Ed25519VerificationKey2020",
  "controller": "<DID>",
  "publicKeyMultibase": "z<multibase-base58btc(record.wallet_address)>"
}
```

The `wallet_address` field of `AgentRecord` **MAY** differ from the `owner` field. This permits an operator (`owner`) to delegate signing authority for off-chain protocol messages to a separate hot key (`wallet_address`) without surrendering on-chain administrative control over the record. Resolvers **MUST** surface this distinction by exposing `controller` (derived from `owner`) and `verificationMethod.publicKeyMultibase` (derived from `wallet_address`) as independent values.

### 4.3 `authentication` and `assertionMethod`

Both relationships **MUST** reference the verification method above:

```json
"authentication": ["<DID>#key-1"],
"assertionMethod": ["<DID>#key-1"]
```

Implementations **MAY** add additional verification relationships (`keyAgreement`, `capabilityInvocation`) if future versions of the AIP Registry Program record additional keys. Until then, no other relationships are normative.

### 4.4 `controller`

The DID is **always** self-controlled. The PDA's authority to mutate state is enforced on-chain by the constraint `owner.key() == agent_record.owner` (see [lib.rs:116](programs/aip-escrow/programs/aip-registry/src/lib.rs#L116)). Because the PDA's seed sequence permanently includes `owner.key()`, transferring administrative ownership to a different wallet is **mathematically impossible without invalidating the DID itself** (see §7.2). Resolvers **MUST NOT** emit a `controller` property pointing to any other DID.

### 4.5 `service` Endpoints

The DID Document **MUST** include exactly one service entry of type `AIPAgentEndpoint`:

```json
{
  "id": "<DID>#agent-endpoint",
  "type": "AIPAgentEndpoint",
  "serviceEndpoint": "<record.endpoint>"
}
```

The endpoint **MUST** be an `https://` URL or a fully-qualified protocol-prefixed URI. The resource served at this endpoint **MUST** conform to the Agent Card JSON Schema defined in the companion SIMD.

### 4.6 Example DID Document

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
    "https://aip.network/ns/agent/v1"
  ],
  "id": "did:aip:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:ada-research-001",
  "controller": "did:aip:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:ada-research-001",
  "verificationMethod": [{
    "id": "did:aip:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:ada-research-001#key-1",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:aip:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:ada-research-001",
    "publicKeyMultibase": "z9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
  }],
  "authentication": ["did:aip:...:ada-research-001#key-1"],
  "assertionMethod":  ["did:aip:...:ada-research-001#key-1"],
  "service": [{
    "id": "did:aip:...:ada-research-001#agent-endpoint",
    "type": "AIPAgentEndpoint",
    "serviceEndpoint": "https://ada.aip.network/v1"
  }]
}
```

---

## 5. CRUD Operations

### 5.1 Create

A new `did:aip` identifier is brought into existence by submitting a Solana transaction containing the `register_agent` instruction of the AIP Registry Program. The instruction signature is:

```rust
pub fn register_agent(
    ctx: Context<RegisterAgent>,
    agent_id: String,           // 1..=32 chars, [A-Za-z0-9_-]
    did: String,                // canonical DID, ≤100 chars
    name: String,               // human-readable, ≤64 chars
    endpoint: String,           // service endpoint URL, ≤200 chars
    wallet_address: Pubkey,     // signing key (MAY equal owner)
    agent_type: u8,             // 0=LLM, 1=Task, 2=Execution
    capabilities_json: String,  // capability summary, ≤512 chars
    version: String,            // SemVer, ≤16 chars
) -> Result<()>;
```

The instruction:

1. **MUST** be signed by the wallet that will become the `owner`.
2. **MUST** allocate a PDA with seeds `["agent", owner.key().as_ref(), agent_id.as_bytes()]` (see [lib.rs:104](programs/aip-escrow/programs/aip-registry/src/lib.rs#L104)).
3. **MUST** populate every field of `AgentRecord` and stamp `registered_at` and `updated_at` with the current Solana cluster time.

A `did:aip` identifier is considered **active** as soon as the transaction containing `register_agent` is finalized at commitment level `confirmed` or higher.

### 5.2 Read (Resolve)

See §6.

### 5.3 Update

The mutable subset of an `AgentRecord` is updated by invoking `update_agent`:

```rust
pub fn update_agent(
    ctx: Context<UpdateAgent>,
    name: String,
    endpoint: String,
    wallet_address: Pubkey,
    agent_type: u8,
    capabilities_json: String,
    version: String,
) -> Result<()>;
```

- The transaction **MUST** be signed by the original `owner` (enforced by `constraint = owner.key() == agent_record.owner`).
- The fields `owner`, `agent_id`, `did`, `registered_at`, and `bump` **MUST NOT** change.
- `updated_at` **MUST** be refreshed to the current cluster timestamp.

Resolvers **MUST** treat the most recently finalized `AgentRecord` state as authoritative; no historical merging is required.

### 5.4 Deactivate

A `did:aip` identifier is deactivated by closing its PDA via `deregister_agent`:

```rust
pub fn deregister_agent(_ctx: Context<DeregisterAgent>) -> Result<()>;
```

The instruction:

- **MUST** be signed by the `owner`.
- Closes the PDA (`close = owner`), returning rent lamports to the owner wallet.

After deactivation, the account no longer exists and resolution of the DID **MUST** return a DID Document with `"deactivated": true` and **MUST NOT** populate `verificationMethod` or `service`. Implementations **MAY** retain the historical state by querying archived ledger snapshots; such retrieval is informative, not normative.

Re-registering the same `agent_id` under the same `owner` after deactivation is permitted and **MUST** be treated as a fresh DID issuance; resolvers **MUST NOT** assume continuity with the prior incarnation.

---

## 6. DID Resolution

### 6.1 Resolution Algorithm (Normative)

Given an input DID `did:aip:{owner_pubkey}:{agent_id}`, a conformant resolver **MUST** execute the following algorithm:

1. **Parse** the DID against the ABNF in §3.2. On any syntax violation, return `invalidDid`.
2. **Decode** `owner_pubkey` from base58 to a 32-byte sequence `O`. On failure, return `invalidDid`.
3. **Encode** `agent_id` as UTF-8 bytes `A`.
4. **Derive** the PDA address `P` and bump seed `b` using `Pubkey::find_program_address(&[b"agent", &O, &A], &PROGRAM_ID)` where `PROGRAM_ID` is `CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc` (or a network-specific override; see §6.3).
5. **Fetch** the account at address `P` from a Solana RPC endpoint at commitment `confirmed` or higher.
6. If the account does not exist, return `notFound` with `"deactivated": true` if a prior version is known, otherwise `notFound`.
7. **Verify** that the account `owner` field equals `PROGRAM_ID`. On mismatch, return `notFound`.
8. **Deserialize** the account data as an `AgentRecord` using Anchor's discriminator-prefixed Borsh layout. On deserialization failure, return `internalError`.
9. **Construct** the DID Document per §4 and return it together with resolver metadata.

### 6.2 Resolver Metadata

A conformant resolver **MUST** return the following resolver metadata fields alongside the DID Document:

| Field | Value |
|-------|-------|
| `contentType` | `"application/did+ld+json"` |
| `did` | The input DID. |
| `pda` | Base58-encoded PDA address `P`. |
| `bump` | The PDA bump seed `b`. |
| `slot` | The Solana slot at which the account was read. |
| `network` | `"solana:mainnet"`, `"solana:devnet"`, or `"solana:testnet"`. |

### 6.3 Network Selection

A future revision of this specification **MAY** introduce a network qualifier (e.g., `did:aip:devnet:{owner}:{agent_id}`). Until then, resolvers **MUST** be configured at instantiation time with the target Solana cluster, and the `network` resolver-metadata field **MUST** disclose the cluster used.

---

## 7. Security Considerations

### 7.1 Key Management & Rotation

Two distinct keys are involved:

1. The **`owner`** key - never recoverable, never rotatable. Loss of this key permanently freezes the agent record (no `update_agent` or `deregister_agent` can succeed). Operators **SHOULD** keep the owner key in cold storage and use `wallet_address` for hot signing.
2. The **`wallet_address`** key - freely rotatable via `update_agent`. Compromise of this key permits forgery of off-chain signed messages but **does not** grant control over the on-chain record.

This split model is the recommended pattern: register from cold storage, sign protocol traffic from a hot key, rotate the hot key at any cadence.

### 7.2 Ownership Transfer Impossibility

The PDA seed sequence permanently includes `owner.key()`. There is no instruction in the program that mutates the `owner` field, and any such mutation would invalidate the PDA address itself. Consequently, **a `did:aip` identifier cannot be transferred to a different controlling wallet**. To migrate control, the original owner **MUST** `deregister_agent` and the new owner **MUST** `register_agent` under their own pubkey, producing a different DID. This is a deliberate design choice that makes phishing-based ownership theft impossible.

### 7.3 Replay Attack Prevention

Solana transactions include a recent blockhash and are uniquely signed by the owner; replay of an earlier `register_agent` or `update_agent` transaction **MUST** fail at the cluster level once the blockhash expires (~150 slots, ≈90 seconds). Resolvers and clients **MUST NOT** implement application-layer replay caches; the consensus layer is authoritative.

### 7.4 Sybil Resistance

Each registration consumes rent-exempt lamports (≈0.0073 SOL for a 1 048-byte account at the time of writing). Bulk Sybil registration is therefore economically rate-limited. Implementations **MAY** raise this barrier in future versions by requiring an additional staked deposit; such mechanisms are out of scope for v1.0 of this specification.

### 7.5 Endpoint Authenticity

The `service` endpoint is an off-chain URL whose contents are not constrained by the on-chain program. Clients consuming an Agent Card from this endpoint **MUST** verify the card's authenticity by either:
- requiring the card to be signed by `wallet_address` and verifying the signature against the DID Document, or
- restricting trust to TLS-authenticated origins controlled by the operator.

A clear-text or unsigned card **MUST NOT** be treated as authoritative.

### 7.6 Program Upgrade Authority

Until the AIP Registry Program is deployed with its upgrade authority irrevocably set to `null`, any party holding the upgrade authority can mutate the program logic and, transitively, the meaning of every existing DID. Mainnet deployment of `did:aip` **MUST** be accompanied by either (a) an irrevocable freeze of the upgrade authority, or (b) transfer to a publicly auditable governance program. See the companion SIMD §6 for the deployment checklist.

---

## 8. Privacy Considerations

### 8.1 Public Disclosure on the Ledger

Every field written to an `AgentRecord` is publicly readable for the lifetime of the Solana ledger and indefinitely beyond, via archival nodes. Operators **MUST NOT** write personal data, secrets, or any information they intend to redact at any point in the future. The on-chain record is a **public, append-only commitment**.

### 8.2 Selective Disclosure via Agent Cards

Sensitive metadata - exact pricing tiers, internal capability descriptions, compliance attestations - **SHOULD** be served from the off-chain endpoint, where the operator retains full control over access policy (auth headers, allowlists, regional restrictions). The on-chain `capabilities_json` field is intended only for a coarse, public summary.

### 8.3 Linkability

A single owner wallet operating multiple agents is publicly linkable across all of its `did:aip` identifiers (because every DID embeds the owner's pubkey). Operators requiring unlinkability between agents **MUST** use a fresh owner wallet for each.

### 8.4 Endpoint Tracking

Resolution of a `did:aip` DID does not contact the agent's endpoint; only an RPC node is contacted. However, any client that subsequently fetches the Agent Card from `endpoint` reveals its IP to the operator. Privacy-sensitive clients **SHOULD** route Agent Card fetches through an anonymizing proxy.

---

## 9. Conformance to DID Core 1.0

This section maps each normative requirement of [DID Core 1.0] to the `did:aip` implementation.

| DID Core Requirement | `did:aip` Conformance |
|----------------------|------------------------|
| §3.1 DID Syntax | Implemented in §3.2 (ABNF). |
| §5.1 DID Document Properties | All required properties (`id`) and recommended properties (`controller`, `verificationMethod`, `authentication`, `service`) implemented in §4. |
| §5.2 DID Subject | The DID subject is the AIP agent represented by the `AgentRecord`. |
| §5.3 DID Controller | Self-controlled; see §4.4. |
| §5.4 Verification Methods | One canonical method (`Ed25519VerificationKey2020`); see §4.2. |
| §5.5 Verification Relationships | `authentication` and `assertionMethod` populated; see §4.3. |
| §5.6 Services | One canonical service of type `AIPAgentEndpoint`; see §4.5. |
| §7.1 DID Resolution | Algorithm specified in §6.1. |
| §7.2 DID URL Dereferencing | Standard fragment dereferencing applies; no custom path/query semantics defined. |
| §8 Methods (CRUD) | All four operations specified in §5. |
| §9 Security Requirements | Addressed in §7. |
| §10 Privacy Requirements | Addressed in §8. |

The `did:aip` method makes no use of the optional `alsoKnownAs` property in v1.0; future revisions **MAY** introduce it for cross-method aliasing.

---

## 10. References

### 10.1 Normative References

- **[DID Core 1.0]** Sporny et al., *Decentralized Identifiers (DIDs) v1.0*, W3C Recommendation, 19 July 2022. https://www.w3.org/TR/did-core/
- **[RFC 2119]** Bradner, S., *Key words for use in RFCs to Indicate Requirement Levels*, IETF, March 1997.
- **[RFC 8174]** Leiba, B., *Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words*, IETF, May 2017.
- **[Ed25519-2020]** *Ed25519 Signature 2020*, W3C Credentials Community Group. https://w3c-ccg.github.io/lds-ed25519-2020/

### 10.2 Informative References

- **[AIP Registry Source]** AIP Agent Registry Program source. [programs/aip-escrow/programs/aip-registry/src/lib.rs](programs/aip-escrow/programs/aip-registry/src/lib.rs)
- **[Solana PDA]** *Program Derived Addresses*, Solana Documentation. https://solana.com/docs/core/pda
- **[Anchor]** *Anchor Framework Documentation*. https://www.anchor-lang.com/
- **[SIMD-AGENT-IDENTITY]** Companion Solana Improvement Document - see `standards/SIMD-XXXX-onchain-agent-identity.md` in this repository.

---

## Appendix A - Test Vectors (Informative)

### A.1 PDA Derivation

Given:
- `owner` = `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`
- `agent_id` = `ada-research-001`
- `program_id` = `CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc`

Expected behavior: `Pubkey::find_program_address(&[b"agent", owner.as_ref(), b"ada-research-001"], &program_id)` returns a deterministic `(pda, bump)` pair. Implementations **MUST** reproduce the same `pda` byte-for-byte.

### A.2 DID String Round-Trip

Input DID:
```
did:aip:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:ada-research-001
```

Parse → derive PDA → fetch account → reconstruct DID Document → re-emit `id` field. The re-emitted `id` **MUST** equal the input DID byte-for-byte.

---

*End of `did:aip` Method Specification v1.0 Draft.*
