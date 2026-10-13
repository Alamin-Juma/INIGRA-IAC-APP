import test from "node:test";
import assert from "node:assert/strict";

import { generateMainTf } from "../src/mainTf.js";
import { parseInput } from "../src/types.js";

const SAMPLE = {
  region: "us-east-1",
  resources: [
    { type: "object-store", name: "Reports Archive" },
    { type: "queue", name: "Order Events" },
    { type: "function", name: "Process Orders", runtime: "python3.12" },
  ],
};

test("generator output is deterministic", () => {
  const parsed = parseInput(SAMPLE);
  const first = generateMainTf(parsed);
  const second = generateMainTf(parsed);
  assert.equal(first, second);
});

test("duplicate names are deduped per type", () => {
  const parsed = parseInput({
    region: "us-east-1",
    resources: [
      { type: "queue", name: "Order Events" },
      { type: "queue", name: "Order Events" },
      { type: "object-store", name: "Order Events" },
      { type: "object-store", name: "Order Events" },
    ],
  });

  const tf = generateMainTf(parsed);
  assert.match(tf, /name = "Order-Events"/);
  assert.match(tf, /name = "Order-Events-2"/);
  assert.match(tf, /bucket = "order-events-\$\{data\.aws_caller_identity\.current\.account_id\}-\$\{data\.aws_region\.current\.region\}"/);
  assert.match(tf, /bucket = "order-events-2-\$\{data\.aws_caller_identity\.current\.account_id\}-\$\{data\.aws_region\.current\.region\}"/);
});

test("unknown type fails loudly", () => {
  assert.throws(
    () => parseInput({ region: "us-east-1", resources: [{ type: "topic", name: "Oops" }] }),
    /unknown type/i,
  );
});

test("long duplicate bucket names keep ordinal suffix and valid edges", () => {
  const long = "Reports Archive For Quarterly Financial Data Warehouse";
  const parsed = parseInput({
    region: "us-east-1",
    resources: [
      { type: "object-store", name: long },
      { type: "object-store", name: long },
    ],
  });

  const tf = generateMainTf(parsed);
  const bucketMatches = [...tf.matchAll(/bucket = "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(bucketMatches.length, 2);
  assert.notEqual(bucketMatches[0], bucketMatches[1]);

  for (const bucketExpr of bucketMatches) {
    const prefix = bucketExpr.split("-${data.aws_caller_identity.current.account_id}")[0];
    assert.ok(prefix.length <= 35, "bucket slug exceeds uniqueness budget");
    assert.match(prefix, /^[a-z0-9]/, "bucket slug must start alphanumeric");
    assert.match(prefix, /[a-z0-9]$/, "bucket slug must end alphanumeric");
  }
});

test("queue names that collapse to same HCL label are deduped", () => {
  const parsed = parseInput({
    region: "us-east-1",
    resources: [
      { type: "queue", name: "Order-Events" },
      { type: "queue", name: "Order_Events" },
    ],
  });

  const tf = generateMainTf(parsed);
  const queueLabels = [...tf.matchAll(/resource "aws_sqs_queue" "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(queueLabels.length, 2);
  assert.notEqual(queueLabels[0], queueLabels[1]);
});

test("lambda role name stays within IAM 64-char limit", () => {
  const longFn = "Very Long Lambda Function Name For Processing Orders In Reporting Pipelines";
  const parsed = parseInput({
    region: "us-east-1",
    resources: [
      { type: "function", name: longFn, runtime: "python3.12" },
    ],
  });

  const tf = generateMainTf(parsed);
  const roleName = tf.match(/resource "aws_iam_role" "[^"]+" {[\s\S]*?name = "([^"]+)"/);
  assert.ok(roleName, "role name not emitted");
  assert.ok(roleName[1].length <= 64, "role name exceeds 64 chars");
  assert.match(roleName[1], /-role$/, "role name must retain -role suffix");
});

// The first version derived the role name from the function name inside the
// emitter. Both of the following produced DUPLICATE role names that passed
// `tofu validate` and failed at apply with EntityAlreadyExists on CreateRole.
function roleNamesOf(tf: string): string[] {
  return [...tf.matchAll(/resource "aws_iam_role" "[^"]+" \{\s*\n\s*name\s*=\s*"([^"]+)"/g)].map(
    (m) => m[1]
  );
}

test("two long function names do not collapse to one role name", () => {
  const long = "A Very Long Function Name That Goes On And On And On Beyond Sixty Four Characters Easily";
  const tf = generateMainTf({
    region: "us-east-1",
    resources: [
      { type: "function", name: long, runtime: "python3.12" },
      { type: "function", name: long, runtime: "python3.12" },
    ],
  });
  const roles = roleNamesOf(tf);
  assert.equal(roles.length, 2);
  assert.notEqual(roles[0], roles[1], "truncation must not erase the dedupe suffix");
  for (const r of roles) assert.ok(r.length <= 64, `role name too long: ${r}`);
});

test("role names are deduped case-insensitively, because IAM ignores case", () => {
  const tf = generateMainTf({
    region: "us-east-1",
    resources: [
      { type: "function", name: "Process Orders", runtime: "python3.12" },
      { type: "function", name: "process orders", runtime: "python3.12" },
    ],
  });
  const roles = roleNamesOf(tf);
  assert.equal(roles.length, 2);
  const lowered = new Set(roles.map((r) => r.toLowerCase()));
  assert.equal(lowered.size, 2, `IAM would treat these as one role: ${roles.join(", ")}`);
});
