import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } = await network.create();

const AMOUNT = parseEther("1"); // 1 MOCA

async function deploy() {
  const escrow = await viem.deployContract("AipEscrow");
  const [payer, payee, authority, other] = await viem.getWalletClients();
  const pub = await viem.getPublicClient();
  return { escrow, payer, payee, authority, other, pub };
}

async function futureDeadline(offset = 3600n): Promise<bigint> {
  const now = BigInt(await networkHelpers.time.latest());
  return now + offset;
}

describe("AipEscrow", () => {
  describe("initializeEscrow", () => {
    it("locks msg.value and stores the escrow", async () => {
      const { escrow, payer, payee, authority } = await deploy();
      const deadline = await futureDeadline();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, deadline],
        { value: AMOUNT, account: payer.account },
      );

      const e = await escrow.read.getEscrow(["task-1"]);
      assert.equal(e.taskId, "task-1");
      assert.equal(e.payer.toLowerCase(), payer.account.address.toLowerCase());
      assert.equal(e.payee.toLowerCase(), payee.account.address.toLowerCase());
      assert.equal(e.authority.toLowerCase(), authority.account.address.toLowerCase());
      assert.equal(e.amount, AMOUNT);
      assert.equal(e.deadline, deadline);
      assert.equal(e.status, 1); // Locked
      assert.equal(await escrow.read.totalEscrows(), 1n);
    });

    it("holds the locked funds in the contract", async () => {
      const { escrow, payer, payee, authority, pub } = await deploy();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, await futureDeadline()],
        { value: AMOUNT, account: payer.account },
      );
      assert.equal(await pub.getBalance({ address: escrow.address }), AMOUNT);
    });

    it("reverts on zero amount", async () => {
      const { escrow, payer, payee, authority } = await deploy();
      await assert.rejects(
        escrow.write.initializeEscrow(
          ["task-1", payee.account.address, authority.account.address, await futureDeadline()],
          { value: 0n, account: payer.account },
        ),
      );
    });

    it("reverts on a past deadline", async () => {
      const { escrow, payer, payee, authority } = await deploy();
      const past = BigInt(await networkHelpers.time.latest()) - 1n;
      await assert.rejects(
        escrow.write.initializeEscrow(
          ["task-1", payee.account.address, authority.account.address, past],
          { value: AMOUNT, account: payer.account },
        ),
      );
    });

    it("reverts on a duplicate taskId", async () => {
      const { escrow, payer, payee, authority } = await deploy();
      const dl = await futureDeadline();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, dl],
        { value: AMOUNT, account: payer.account },
      );
      await assert.rejects(
        escrow.write.initializeEscrow(
          ["task-1", payee.account.address, authority.account.address, dl],
          { value: AMOUNT, account: payer.account },
        ),
      );
    });

    it("reverts on a taskId over 64 chars", async () => {
      const { escrow, payer, payee, authority } = await deploy();
      await assert.rejects(
        escrow.write.initializeEscrow(
          ["x".repeat(65), payee.account.address, authority.account.address, await futureDeadline()],
          { value: AMOUNT, account: payer.account },
        ),
      );
    });
  });

  describe("releaseEscrow", () => {
    it("authority releases funds to the payee", async () => {
      const { escrow, payer, payee, authority, pub } = await deploy();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, await futureDeadline()],
        { value: AMOUNT, account: payer.account },
      );

      const before = await pub.getBalance({ address: payee.account.address });
      await escrow.write.releaseEscrow(["task-1"], { account: authority.account });
      const after = await pub.getBalance({ address: payee.account.address });

      assert.equal(after - before, AMOUNT); // payee pays no gas (authority signs)
      assert.equal((await escrow.read.getEscrow(["task-1"])).status, 2); // Released
      assert.equal(await pub.getBalance({ address: escrow.address }), 0n);
    });

    it("reverts when a non-authority tries to release", async () => {
      const { escrow, payer, payee, authority, other } = await deploy();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, await futureDeadline()],
        { value: AMOUNT, account: payer.account },
      );
      await assert.rejects(escrow.write.releaseEscrow(["task-1"], { account: other.account }));
      await assert.rejects(escrow.write.releaseEscrow(["task-1"], { account: payer.account }));
    });

    it("reverts on double release (NotLocked)", async () => {
      const { escrow, payer, payee, authority } = await deploy();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, await futureDeadline()],
        { value: AMOUNT, account: payer.account },
      );
      await escrow.write.releaseEscrow(["task-1"], { account: authority.account });
      await assert.rejects(escrow.write.releaseEscrow(["task-1"], { account: authority.account }));
    });

    it("reverts releasing an unknown task", async () => {
      const { escrow, authority } = await deploy();
      await assert.rejects(escrow.write.releaseEscrow(["ghost"], { account: authority.account }));
    });
  });

  describe("refundEscrow", () => {
    it("authority refunds funds to the payer", async () => {
      const { escrow, payer, payee, authority, pub } = await deploy();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, await futureDeadline()],
        { value: AMOUNT, account: payer.account },
      );

      const before = await pub.getBalance({ address: payer.account.address });
      await escrow.write.refundEscrow(["task-1"], { account: authority.account });
      const after = await pub.getBalance({ address: payer.account.address });

      assert.equal(after - before, AMOUNT); // payer pays no gas (authority signs)
      assert.equal((await escrow.read.getEscrow(["task-1"])).status, 3); // Refunded
    });

    it("reverts when a non-authority tries to refund", async () => {
      const { escrow, payer, payee, authority, other } = await deploy();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, await futureDeadline()],
        { value: AMOUNT, account: payer.account },
      );
      await assert.rejects(escrow.write.refundEscrow(["task-1"], { account: other.account }));
    });
  });

  describe("cancelEscrow", () => {
    it("payer reclaims after the deadline", async () => {
      const { escrow, payer, payee, authority, pub } = await deploy();
      const deadline = await futureDeadline(100n);
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, deadline],
        { value: AMOUNT, account: payer.account },
      );

      // before deadline: cannot cancel
      await assert.rejects(escrow.write.cancelEscrow(["task-1"], { account: payer.account }));

      await networkHelpers.time.increase(101);

      const before = await pub.getBalance({ address: payer.account.address });
      const txHash = await escrow.write.cancelEscrow(["task-1"], { account: payer.account });
      const receipt = await pub.getTransactionReceipt({ hash: txHash });
      const gas = receipt.gasUsed * receipt.effectiveGasPrice;
      const after = await pub.getBalance({ address: payer.account.address });

      // payer signs the cancel, so they get the amount back minus gas
      assert.equal(after - before, AMOUNT - gas);
      assert.equal((await escrow.read.getEscrow(["task-1"])).status, 4); // Cancelled
    });

    it("reverts when a non-payer tries to cancel", async () => {
      const { escrow, payer, payee, authority, other } = await deploy();
      const deadline = await futureDeadline(100n);
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, deadline],
        { value: AMOUNT, account: payer.account },
      );
      await networkHelpers.time.increase(101);
      await assert.rejects(escrow.write.cancelEscrow(["task-1"], { account: other.account }));
      // authority cannot cancel either (only payer)
      await assert.rejects(escrow.write.cancelEscrow(["task-1"], { account: authority.account }));
    });

    it("reverts canceling before the deadline", async () => {
      const { escrow, payer, payee, authority } = await deploy();
      await escrow.write.initializeEscrow(
        ["task-1", payee.account.address, authority.account.address, await futureDeadline(3600n)],
        { value: AMOUNT, account: payer.account },
      );
      await assert.rejects(escrow.write.cancelEscrow(["task-1"], { account: payer.account }));
    });
  });

  describe("escrowKey parity (client <-> contract)", () => {
    it("keccak256(abi.encode(taskId)) matches the contract", async () => {
      const { escrow } = await deploy();
      const { keccak256, encodeAbiParameters } = await import("viem");
      const taskId = "task-parity";
      const jsKey = keccak256(encodeAbiParameters([{ type: "string" }], [taskId]));
      const solKey = await escrow.read.escrowKey([taskId]);
      assert.equal(jsKey, solKey);
    });
  });
});
