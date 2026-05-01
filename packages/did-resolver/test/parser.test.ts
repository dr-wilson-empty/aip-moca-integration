import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseDid, formatDid } from "../src/parser.js";

const VALID_OWNER = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

test("parseDid accepts canonical did:aip", () => {
  const out = parseDid(`did:aip:${VALID_OWNER}:agent-001`);
  assert.equal(out.ownerPubkey, VALID_OWNER);
  assert.equal(out.agentId, "agent-001");
});

test("parseDid rejects wrong scheme", () => {
  assert.throws(() => parseDid(`did:foo:${VALID_OWNER}:agent`));
});

test("parseDid rejects empty agent id", () => {
  assert.throws(() => parseDid(`did:aip:${VALID_OWNER}:`));
});

test("parseDid rejects oversize agent id", () => {
  const tooLong = "a".repeat(33);
  assert.throws(() => parseDid(`did:aip:${VALID_OWNER}:${tooLong}`));
});

test("parseDid rejects invalid characters in agent id", () => {
  assert.throws(() => parseDid(`did:aip:${VALID_OWNER}:has spaces`));
  assert.throws(() => parseDid(`did:aip:${VALID_OWNER}:has.dots`));
});

test("parseDid rejects invalid base58 owner", () => {
  assert.throws(() => parseDid("did:aip:0OIl:agent"));
});

test("formatDid round-trips", () => {
  const did = formatDid(VALID_OWNER, "round-trip-test");
  const parsed = parseDid(did);
  assert.equal(parsed.ownerPubkey, VALID_OWNER);
  assert.equal(parsed.agentId, "round-trip-test");
});
