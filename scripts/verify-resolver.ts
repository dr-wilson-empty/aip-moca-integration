/**
 * Live verification of the Moca did:aip resolver + registry client against the
 * deployed AipRegistry on Moca testnet. Full lifecycle, leaves the registry clean.
 *
 *   DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/verify-resolver.ts
 */
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AipRegistryClient, mocaTestnet } from "../src/lib/moca/registry-client";
import { AipMocaResolver, formatMocaDid } from "../src/lib/moca/resolver";
import { MOCA_REGISTRY_ADDRESS } from "../src/lib/moca/deployments";

const pk = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("set DEPLOYER_PRIVATE_KEY env var (0x-prefixed)");

const account = privateKeyToAccount(pk);
const owner = account.address;
const registry = MOCA_REGISTRY_ADDRESS.testnet as `0x${string}`;

const client = new AipRegistryClient(registry);
const resolver = new AipMocaResolver(registry);
const pub = createPublicClient({ chain: mocaTestnet, transport: http() });

async function main() {
  const did = formatMocaDid(owner, "resolve-test");
  console.log("owner:", owner);
  console.log("did:  ", did);

  console.log("\n-> register (via registry-client)");
  const tx = await client.registerAgent(pk!, {
    agentId: "resolve-test",
    did,
    name: "Resolve Test Agent",
    endpoint: "https://agents.example.com/resolve",
    walletAddress: owner,
    agentType: 1,
    capabilities: [{ name: "echo", description: "echo capability" }],
    pricePerTask: 100000n,
    version: "1.0.0",
  });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log("   tx:", tx);

  console.log("\n-> resolve (via AipMocaResolver)");
  const res = await resolver.resolve(did);
  console.log("   didDocument.id :", res.didDocument?.id);
  console.log("   verification   :", JSON.stringify(res.didDocument?.verificationMethod?.[0]));
  console.log("   service        :", res.didDocument?.service?.[0]?.serviceEndpoint);
  console.log("   agentRecord    :", res.agentRecord?.name, "| caps:", res.agentRecord?.capabilities.length);
  console.log("   metadata       :", JSON.stringify(res.didResolutionMetadata));

  console.log("\n-> negative cases");
  const notFound = await resolver.resolve(formatMocaDid(owner, "does-not-exist"));
  console.log("   notFound   →", JSON.stringify(notFound.didResolutionMetadata));
  const invalid = await resolver.resolve("did:aip:not-an-evm-address:x");
  console.log("   invalidDid →", JSON.stringify(invalid.didResolutionMetadata));

  console.log("\n-> deregister (cleanup)");
  const del = await client.deregisterAgent(pk!, "resolve-test");
  await pub.waitForTransactionReceipt({ hash: del });
  console.log("   tx:", del);
  const after = await resolver.resolve(did);
  console.log("   resolve after deregister →", JSON.stringify(after.didResolutionMetadata));

  console.log("\nResolver live verification passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
