import type { PlannedResource } from "../dedupe.js";

export function emitSqs(resource: PlannedResource): string {
  return `resource "aws_sqs_queue" "${resource.hclLabel}" {
  name = "${resource.uniqueName}"
}`;
}
