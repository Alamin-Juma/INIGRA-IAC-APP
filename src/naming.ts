import type { ResourceType } from "./types.js";

const S3_RESERVED_PREFIXES = ["xn--", "sthree-", "amzn-s3-demo-"];
const S3_RESERVED_SUFFIXES = ["-s3alias", "--ol-s3", ".mrap", "--x-s3", "--table-s3"];

export const S3_UNIQUENESS_BUDGET = 35;

/**
 * An IAM role name is limited to 64 characters AND is compared
 * case-insensitively: "Role1" and "role1" are the same role, so a generator
 * that preserves input case must dedupe role names without regard to case.
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.CfnRoleProps.html
 */
export const IAM_ROLE_NAME_MAX = 64;

/**
 * Longest name each service accepts, as used by this generator.
 * S3 is not 63 here: the emitted bucket name is
 *   <name>-<account-id>-<region>
 * so the slug only gets what is left of 63 after the account id (12) and the
 * longest region (~14) plus two separators. See emit/s3.ts.
 */
export function maxNameLength(type: ResourceType): number {
  if (type === "object-store") return S3_UNIQUENESS_BUDGET;
  if (type === "queue") return 80;
  return 64;
}

/**
 * Append `suffix` to `base` without exceeding `max`.
 *
 * Truncating AFTER appending is what silently removes the suffix: a 35-char
 * base plus "-2" is 37, clamped back to 35, which is the original name again --
 * two resources then collide on both the AWS name and the HCL label. Trimming
 * the base first keeps the suffix, and stripping any separator the cut exposes
 * avoids a trailing "-" (illegal at the end of an S3 bucket name).
 */
export function withSuffixWithinLimit(base: string, suffix: string, max: number): string {
  const room = Math.max(1, max - suffix.length);
  const head = (base.length <= room ? base : base.slice(0, room)).replace(/[-_]+$/, "");
  return `${head}${suffix}`;
}

export function slug(name: string): string {
  const trimmed = name.trim();
  const wsCollapsed = trimmed.replace(/\s+/g, "-");
  const cleaned = wsCollapsed.replace(/[^A-Za-z0-9-_]/g, "-");
  const collapsed = cleaned.replace(/-+/g, "-");
  const noEdgeDash = collapsed.replace(/^-+/, "").replace(/-+$/, "");
  return noEdgeDash || "resource";
}

export function normalizeBaseName(type: ResourceType, inputName: string): string {
  if (type === "object-store") {
    return normalizeS3Base(inputName);
  }
  if (type === "queue") {
    return clamp(slug(inputName), 80);
  }
  return clamp(slug(inputName), 64);
}

export function addOrdinalSuffix(type: ResourceType, base: string, ordinal: number): string {
  if (ordinal <= 1) {
    return base;
  }
  return withSuffixWithinLimit(base, `-${ordinal}`, maxNameLength(type));
}

export function normalizeForType(type: ResourceType, withSuffix: string): string {
  if (type === "object-store") {
    return normalizeS3Final(withSuffix);
  }
  if (type === "queue") {
    return clamp(withSuffix, 80);
  }
  return clamp(withSuffix, 64);
}

export function toHclLabel(value: string): string {
  const label = value
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "");
  return label || "resource";
}

function normalizeS3Base(name: string): string {
  let result = slug(name).toLowerCase().replace(/_/g, "-");
  result = result.replace(/\.+/g, "-");
  result = result.replace(/-+/g, "-");
  result = ensureS3EdgeAlnum(result);

  if (looksLikeIpv4(result)) {
    result = `${result}-b`;
  }

  for (const prefix of S3_RESERVED_PREFIXES) {
    if (result.startsWith(prefix)) {
      result = `b-${result}`;
      break;
    }
  }

  for (const suffix of S3_RESERVED_SUFFIXES) {
    if (result.endsWith(suffix)) {
      result = `${result}-bucket`;
      break;
    }
  }

  result = ensureS3LengthRange(result);
  // Clean AFTER truncating: slicing can expose a trailing '-', and an S3 name
  // must begin and end with a letter or number.
  return ensureS3EdgeAlnum(clamp(result, S3_UNIQUENESS_BUDGET));
}

function normalizeS3Final(nameWithOrdinalSuffix: string): string {
  let result = nameWithOrdinalSuffix.toLowerCase().replace(/_/g, "-");
  result = result.replace(/\.+/g, "-");
  result = result.replace(/-+/g, "-");
  result = ensureS3EdgeAlnum(result);

  for (const prefix of S3_RESERVED_PREFIXES) {
    if (result.startsWith(prefix)) {
      result = `b-${result}`;
      break;
    }
  }

  for (const suffix of S3_RESERVED_SUFFIXES) {
    if (result.endsWith(suffix)) {
      result = `${result}-bucket`;
      break;
    }
  }

  if (looksLikeIpv4(result)) {
    result = `${result}-b`;
  }

  result = ensureS3LengthRange(result);
  return ensureS3EdgeAlnum(clamp(result, S3_UNIQUENESS_BUDGET));
}

function ensureS3EdgeAlnum(value: string): string {
  let v = value.replace(/^-+/, "").replace(/-+$/, "");
  v = v.replace(/^[^a-z0-9]+/, "");
  v = v.replace(/[^a-z0-9]+$/, "");
  return v || "bucket";
}

function ensureS3LengthRange(value: string): string {
  let v = value;
  while (v.length < 3) {
    v = `${v}0`;
  }
  if (v.length > 63) {
    v = v.slice(0, 63);
  }
  return ensureS3EdgeAlnum(v);
}

function looksLikeIpv4(value: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value);
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
