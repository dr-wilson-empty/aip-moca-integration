# AIP on Moca Chain

On-chain contracts and clients porting the **Agent Internet Protocol (AIP)** from
Solana to **Moca Chain** (EVM, testnet chainId `222888`).

AIP lets autonomous agents publish an identity, be discovered, and settle
payments for tasks. This package ports the three on-chain primitives to Moca and
keeps the chain-agnostic protocol layers unchanged.

| Primitive | Where | What it does |
|-----------|-------|--------------|
| Identity / registry | `AipRegistry.sol` | agent records: did, endpoint, capabilities, price, payout wallet |
| Discovery | `src/lib/moca/resolver.ts` | resolve a `did:aip` to a W3C DID Document, reading the registry |
| Payment | `AipEscrow.sol` | lock / release / refund / cancel native MOCA per task |

## Deployed addresses (Moca testnet, chainId 222888)

| Contract | Address |
|----------|---------|
| AipRegistry | [`0x6caea13e7d5fbC4bDa28414C9aa97799fac68c36`](https://testnet-scan.mocachain.org/address/0x6caea13e7d5fbC4bDa28414C9aa97799fac68c36) |
| AipEscrow | [`0xFe362801345513fC7f46050199DdE08bf7B998F1`](https://testnet-scan.mocachain.org/address/0xFe362801345513fC7f46050199DdE08bf7B998F1) |

RPC `https://rpc.testnet.mocachain.dev` · Explorer `https://testnet-scan.mocachain.org` · Faucet `https://faucet.mocachain.org`

## Why the port is clean

Moca Chain is EVM-compatible, so standard Ethereum tooling (Hardhat, viem,
MetaMask) works as-is. The Solana-specific pieces map directly:

| Solana / Anchor | Moca / EVM |
|-----------------|------------|
| Anchor program (Rust) | Solidity contract |
| PDA `["agent", owner, id]` | `keccak256(abi.encode(owner, id))` mapping key |
| Borsh serialization | ABI encoding |
| SPL token (USDC) | native MOCA (`msg.value`) |
| Ed25519 wallet | secp256k1 / EVM address |
| `@solana/web3.js` | `viem` |
| `getProgramAccounts` scan | on-chain enumeration arrays |

The `did:aip` format, agent-card schema and the rest of the protocol carried
over unchanged. Only the read/write layer is chain-specific.

## Authorization (matches the Solana programs)

- **Registry:** only the owner can update or deregister their agent.
- **Escrow:** the `authority` (server) releases or refunds; the `payer` can
  cancel only after the deadline; every transition requires the escrow to be
  `Locked`. Native transfers use checks-effects-interactions plus a reentrancy
  guard.

## Layout

```
moca-contracts/
  contracts/        AipRegistry.sol, AipEscrow.sol
  test/             viem + node:test suites (34 tests)
  ignition/modules/ deploy modules
  scripts/smoke.ts  registry lifecycle smoke test
src/lib/moca/       app-side clients: registry-client, resolver, escrow-client, ABIs, deployments
scripts/            verify-resolver.ts, verify-escrow.ts, demo.ts (live testnet)
```

## Develop

```bash
cd moca-contracts
npm install
npm run compile     # solc 0.8.24, evmVersion london, viaIR
npm test            # 34 tests (registry 18 + escrow 16)
```

## Deploy to testnet

Copy `.env.example` to `.env`, set `DEPLOYER_PRIVATE_KEY` (fund it from the
faucet), then:

```bash
npm run deploy:testnet   # AipRegistry
npm run deploy:escrow    # AipEscrow
```

## End-to-end demo

From the project root, with `DEPLOYER_PRIVATE_KEY` set:

```bash
npx tsx scripts/demo.ts
```

Runs the whole flow live on testnet: register an agent, resolve its `did:aip`,
escrow a task fee in native MOCA, release it to the agent's payout wallet, then
deregister. The payout wallet is a fresh address so the balance increase is
visible proof of settlement.
