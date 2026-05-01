import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROGRAM_ID = new PublicKey("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");

async function main() {
  // ----- Setup -----
  const idlPath = path.join(process.cwd(), "target", "idl", "aip_registry.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const ownerKp = Keypair.fromSecretKey(Uint8Array.from(secret));
  const wallet = new anchor.Wallet(ownerKp);

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = new Program(idl, provider) as Program<any>;

  console.log("Owner:", ownerKp.publicKey.toBase58());
  console.log("Program:", PROGRAM_ID.toBase58());
  const startBal = await connection.getBalance(ownerKp.publicKey);
  console.log("Balance:", (startBal / 1e9).toFixed(6), "SOL\n");

  // Unique agent_id per run
  const agentId = `smoke-${Date.now().toString(36)}`;
  const did = `did:aip:${ownerKp.publicKey.toBase58()}:${agentId}`;

  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), ownerKp.publicKey.toBuffer(), Buffer.from(agentId)],
    PROGRAM_ID,
  );
  console.log(`agent_id: ${agentId}`);
  console.log(`PDA:      ${pda.toBase58()} (bump ${bump})\n`);

  // ----- 1) register_agent -----
  console.log("[1] register_agent…");
  const sig1 = await program.methods
    .registerAgent(
      agentId,
      did,
      "Smoke Test Agent",
      "https://smoke.aip.network/v1",
      ownerKp.publicKey,                       // wallet_address = owner for this test
      { llm: {} },                              // AgentType::Llm
      [
        { name: "text-completion", description: "GPT-style chat completions" },
        { name: "code-execution",  description: "Sandboxed Python eval"      },
      ],
      new BN(1_000_000),                        // price_per_task = 0.001 SOL
      "1.0.0",
    )
    .accounts({
      owner: ownerKp.publicKey,
      agentRecord: pda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  console.log("    sig:", sig1);

  // ----- 2) fetch + assert -----
  console.log("\n[2] fetch + deserialize…");
  const rec1: any = await (program.account as any).agentRecord.fetch(pda);
  console.log("    name              =", rec1.name);
  console.log("    did               =", rec1.did);
  console.log("    agent_type        =", JSON.stringify(rec1.agentType));
  console.log("    capabilities.len  =", rec1.capabilities.length);
  console.log("    capabilities[0]   =", rec1.capabilities[0].name, " - ", rec1.capabilities[0].description);
  console.log("    price_per_task    =", rec1.pricePerTask.toString(), "lamports");
  console.log("    version           =", rec1.version);
  console.log("    registered_at     =", rec1.registeredAt.toString());

  if (rec1.name !== "Smoke Test Agent") throw new Error("name mismatch");
  if (rec1.capabilities.length !== 2) throw new Error("capabilities len mismatch");
  if (rec1.capabilities[0].name !== "text-completion") throw new Error("cap[0].name mismatch");
  if (!rec1.pricePerTask.eq(new BN(1_000_000))) throw new Error("price mismatch");
  if (!("llm" in rec1.agentType)) throw new Error("agent_type variant mismatch");
  console.log("    ✓ all assertions passed");

  // ----- 3) update_agent -----
  console.log("\n[3] update_agent (rotate hot key, raise price, switch to Task)…");
  const hotKey = Keypair.generate();
  const sig2 = await program.methods
    .updateAgent(
      "Smoke Test Agent v2",
      "https://smoke.aip.network/v2",
      hotKey.publicKey,
      { task: {} },                             // AgentType::Task
      [
        { name: "task-orchestration", description: "Multi-step plan execution" },
      ],
      new BN(2_500_000),                        // 0.0025 SOL
      "1.1.0",
    )
    .accounts({
      owner: ownerKp.publicKey,
      agentRecord: pda,
    })
    .rpc();
  console.log("    sig:", sig2);

  const rec2: any = await (program.account as any).agentRecord.fetch(pda);
  if (rec2.name !== "Smoke Test Agent v2") throw new Error("update name failed");
  if (!rec2.walletAddress.equals(hotKey.publicKey)) throw new Error("hot-key rotation failed");
  if (!("task" in rec2.agentType)) throw new Error("agent_type update failed");
  if (rec2.capabilities.length !== 1) throw new Error("capabilities update failed");
  if (!rec2.pricePerTask.eq(new BN(2_500_000))) throw new Error("price update failed");
  if (rec2.updatedAt.lte(rec1.updatedAt)) throw new Error("updated_at not advanced");
  // Immutable fields
  if (rec2.agentId !== rec1.agentId) throw new Error("agent_id MUTATED");
  if (rec2.did !== rec1.did) throw new Error("did MUTATED");
  if (!rec2.registeredAt.eq(rec1.registeredAt)) throw new Error("registered_at MUTATED");
  console.log("    ✓ mutable fields updated, immutable fields preserved");

  // ----- 4) deregister_agent -----
  console.log("\n[4] deregister_agent…");
  const sig3 = await program.methods
    .deregisterAgent()
    .accounts({
      owner: ownerKp.publicKey,
      agentRecord: pda,
    })
    .rpc();
  console.log("    sig:", sig3);

  const closed = await connection.getAccountInfo(pda);
  if (closed !== null) throw new Error("PDA not closed");
  console.log("    ✓ PDA closed, rent returned");

  // ----- Final report -----
  const endBal = await connection.getBalance(ownerKp.publicKey);
  console.log("\n=== SMOKE TEST PASSED ===");
  console.log(`Balance delta: ${((endBal - startBal) / 1e9).toFixed(6)} SOL (tx fees only)`);
  console.log(`Final balance: ${(endBal / 1e9).toFixed(6)} SOL`);
}

main().catch((e) => {
  console.error("\n!!! SMOKE TEST FAILED !!!");
  console.error(e);
  process.exit(1);
});
