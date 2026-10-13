import { dedupeResources } from "./dedupe.js";
import { emitHeader } from "./emit/header.js";
import { emitLambda } from "./emit/lambda.js";
import { emitS3 } from "./emit/s3.js";
import { emitSqs } from "./emit/sqs.js";
import { joinBlocks } from "./hcl.js";
import type { InputSpec } from "./types.js";

export function generateMainTf(input: InputSpec): string {
  const planned = dedupeResources(input.resources);

  const blocks: string[] = [emitHeader(input.region)];

  for (const resource of planned) {
    if (resource.spec.type === "object-store") {
      blocks.push(emitS3(resource));
      continue;
    }

    if (resource.spec.type === "queue") {
      blocks.push(emitSqs(resource));
      continue;
    }

    if (resource.spec.type === "function") {
      blocks.push(emitLambda(resource));
      continue;
    }

    const neverType: never = resource.spec;
    throw new Error(`Unsupported resource type: ${JSON.stringify(neverType)}`);
  }

  return joinBlocks(blocks);
}
