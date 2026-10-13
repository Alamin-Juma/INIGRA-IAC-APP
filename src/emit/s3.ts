import type { PlannedResource } from "../dedupe.js";

export function emitS3(resource: PlannedResource): string {
  return `resource "aws_s3_bucket" "${resource.hclLabel}" {
  bucket = "${resource.uniqueName}-${"${data.aws_caller_identity.current.account_id}"}-${"${data.aws_region.current.region}"}"
}`;
}
