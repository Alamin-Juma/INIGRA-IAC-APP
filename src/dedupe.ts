import type { ResourceSpec } from "./types.js";
import {
  IAM_ROLE_NAME_MAX,
  addOrdinalSuffix,
  normalizeBaseName,
  normalizeForType,
  toHclLabel,
  withSuffixWithinLimit,
} from "./naming.js";

export interface PlannedResource {
  spec: ResourceSpec;
  uniqueName: string;
  hclLabel: string;
  /** Execution role name. Set for type=function only; see uniqueRoleName. */
  roleName?: string;
}

/**
 * A unique IAM role name for a Lambda.
 *
 * This cannot be derived from the function name alone, which is what the first
 * version did, for two reasons:
 *
 * 1. TRUNCATION. "<fn>-role" must fit 64 characters, so the function name is
 *    trimmed to 59 first. Two functions whose names differ only beyond
 *    character 59 -- exactly what the "-2" dedupe suffix produces -- trim to
 *    the same head and therefore to the same role name.
 *
 * 2. CASE. IAM does not distinguish role names by case, so "Process-Orders"
 *    and "process-orders" are two legitimately distinct Lambdas (Lambda IS
 *    case-sensitive) whose roles collide.
 *
 * Both failures are invisible to `tofu validate` and surface at apply time as
 * EntityAlreadyExists on CreateRole. The disambiguator is inserted BEFORE
 * "-role" so the suffix always survives the trim.
 */
function uniqueRoleName(uniqueName: string, usedLower: Set<string>): string {
  let candidate = withSuffixWithinLimit(uniqueName, "-role", IAM_ROLE_NAME_MAX);
  let n = 2;
  while (usedLower.has(candidate.toLowerCase())) {
    candidate = withSuffixWithinLimit(uniqueName, `-${n}-role`, IAM_ROLE_NAME_MAX);
    n += 1;
  }
  usedLower.add(candidate.toLowerCase());
  return candidate;
}

export function dedupeResources(resources: ResourceSpec[]): PlannedResource[] {
  const seen = new Map<string, number>();
  // HCL labels are deduped separately from AWS names because they collide for a
  // different reason: toHclLabel maps '-' and '_' both to '_', and underscores
  // are legal in SQS and Lambda names. So "Order-Events" and "Order_Events" are
  // two distinct queues whose labels are both Order_Events -- a duplicate
  // resource address, which is a parse error rather than an AWS error.
  const usedLabels = new Set<string>();
  // Lowercased, because IAM compares role names case-insensitively.
  const usedRoleNames = new Set<string>();

  return resources.map((spec) => {
    const base = normalizeBaseName(spec.type, spec.name);
    const key = `${spec.type}:${base}`;
    const count = seen.get(key) ?? 0;
    const ordinal = count + 1;
    seen.set(key, ordinal);

    const withOrdinal = addOrdinalSuffix(spec.type, base, ordinal);
    const uniqueName = normalizeForType(spec.type, withOrdinal);

    let hclLabel = toHclLabel(uniqueName);
    if (usedLabels.has(hclLabel)) {
      let n = 2;
      while (usedLabels.has(`${hclLabel}_${n}`)) {
        n += 1;
      }
      hclLabel = `${hclLabel}_${n}`;
    }
    usedLabels.add(hclLabel);

    const roleName =
      spec.type === "function" ? uniqueRoleName(uniqueName, usedRoleNames) : undefined;

    return { spec, uniqueName, hclLabel, roleName };
  });
}
