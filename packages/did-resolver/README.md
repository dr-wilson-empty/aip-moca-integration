# @aipagents/did-resolver

Reference resolver for the `did:aip` W3C DID method. Resolves Solana
anchored agent identifiers into DID Documents using only a public RPC
endpoint, with no central registry or third party service required.

Every AIP agent has a deterministic DID derived from its owner's
Solana public key and an `agent_id` string the owner chose at
registration. This package turns that DID into a fully populated W3C
DID Document by reading the corresponding `AgentRecord` PDA directly
from the Solana program that backs the registry.

## Install

```bash
npm install @aipagents/did-resolver
```

Requires Node 18 or later.

## Quick start

```ts
import { AipDidResolver } from "@aipagents/did-resolver";

const resolver = new AipDidResolver({
  rpcEndpoint: "https://api.devnet.solana.com",
  network: "solana:devnet",
});

const result = await resolver.resolve(
  "did:aip:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:my-agent",
);

if (result.didDocument) {
  console.log(result.didDocument);
} else {
  console.log("resolution error:", result.didResolutionMetadata);
}
```

## What it does

When you call `resolver.resolve(did)`, the package:

1. Parses the `did:aip` identifier against the ABNF grammar defined
   in section 3.2 of the method specification.
2. Derives the `AgentRecord` Program Derived Address using
   `find_program_address` with the seeds `["agent", owner_pubkey,
   agent_id]`.
3. Fetches the account from a Solana RPC endpoint at the configured
   commitment level.
4. Decodes the Anchor discriminator prefixed Borsh layout into a
   typed `AgentRecord`.
5. Constructs a DID Document that conforms to W3C DID Core 1.0,
   exposing the owner public key as the verification method, the
   agent endpoint as a `service`, and the capability list as
   `serviceEndpoint` metadata.

The resolver does not require any private credentials and does not
write to chain. It is purely a read path.

## API

### `new AipDidResolver(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rpcEndpoint` | `string` | required | Solana RPC URL to read account data from. |
| `programId` | `string` | AIP registry on devnet | Override the program id when targeting a non default deployment. |
| `network` | `"solana:devnet" \| "solana:mainnet"` | `"solana:devnet"` | Network identifier embedded in the resulting DID Document. |
| `commitment` | `"processed" \| "confirmed" \| "finalized"` | `"confirmed"` | Solana commitment level for account reads. |

### `resolver.resolve(did)`

Performs the full resolution. Returns
`{ didDocument, didResolutionMetadata, didDocumentMetadata, agentRecord }`.
If the account is missing, `didDocument` is `null` and the metadata
explains why (`invalidDid`, `notFound`, `internalError`).

### `resolver.derivePda(did)`

Returns the PDA address for a DID without an RPC call. Useful when
you need the on chain address (for example, to display a Solana
Explorer link) but do not want to fetch the account.

### `parseDid(did)` / `formatDid(owner, agentId)`

Pure string helpers for parsing and constructing canonical
`did:aip:<owner-pubkey>:<agent-id>` identifiers without any network
or chain access.

## Default program

The resolver defaults to the AIP Agent Registry Program on Solana
Devnet:

```
CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc
```

Override the `programId` option to point at a different deployment
(for example, a fork on a local test validator or a mainnet release).

## Tests

```bash
npm test
```

The unit tests run offline. The optional Devnet integration test runs
only when a funded keypair is available at `~/.config/solana/id.json`
or wherever `SOLANA_DEVNET_KEYPAIR` points. It registers a fresh
agent, resolves it, asserts the DID Document is correctly formed, and
cleans up.

## Source and license

Built and published from the
[`dr-wilson-empty/aip-beta`](https://github.com/dr-wilson-empty/aip-beta)
monorepo alongside the CLI, backend, and Agent SDK.

MIT License.

## Links

- Website: https://aipagents.xyz
- CLI: [@aipagents/cli](https://www.npmjs.com/package/@aipagents/cli)
- Agent SDK: [@aipagents/agent-sdk](https://www.npmjs.com/package/@aipagents/agent-sdk)
- Source: https://github.com/dr-wilson-empty/aip-beta
- DID method specification: https://github.com/w3c/did-extensions/pull/704
- Twitter/X: [@aipagents](https://x.com/aipagents)
