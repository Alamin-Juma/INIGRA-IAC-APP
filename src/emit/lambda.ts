import type { PlannedResource } from "../dedupe.js";
import type { FunctionResource } from "../types.js";
// The role name is computed in dedupe.ts, not here: it has to be unique across
// ALL functions and compared case-insensitively, which a per-resource emitter
// cannot know. Deriving it here from the function name produced duplicate role
// names that passed validate and failed at CreateRole.

interface RuntimeMap {
  filename: string;
  handler: string;
  inlineSource: string;
}

const RUNTIME_MAP: Record<string, RuntimeMap> = {
  "python3.12": {
    filename: "index.py",
    handler: "index.handler",
    inlineSource: `def handler(event, context):\n    return {"statusCode": 200, "body": "ok"}`,
  },
  "nodejs20.x": {
    filename: "index.mjs",
    handler: "index.handler",
    inlineSource: `export const handler = async (event) => ({\n  statusCode: 200,\n  body: "ok"\n});`,
  },
};

export function emitLambda(resource: PlannedResource): string {
  const fn = resource.spec as FunctionResource;
  const runtimeConfig = RUNTIME_MAP[fn.runtime];
  if (!runtimeConfig) {
    throw new Error(`Unsupported Lambda runtime: ${fn.runtime}`);
  }

  const roleLabel = `${resource.hclLabel}_role`;
  const archiveLabel = `${resource.hclLabel}_zip`;
  const attachLabel = `${resource.hclLabel}_basic`;
  const logLabel = `${resource.hclLabel}_logs`;

  const roleName = resource.roleName;
  if (!roleName) {
    throw new Error(`No role name planned for function ${resource.uniqueName}`);
  }

  return `resource "aws_iam_role" "${roleLabel}" {
  name = "${roleName}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "${attachLabel}" {
  role       = aws_iam_role.${roleLabel}.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "${archiveLabel}" {
  type        = "zip"
  output_path = "\${path.module}/${resource.hclLabel}.zip"

  source {
    filename = "${runtimeConfig.filename}"
    content  = <<-EOT
${runtimeConfig.inlineSource}
EOT
  }
}

resource "aws_lambda_function" "${resource.hclLabel}" {
  function_name    = "${resource.uniqueName}"
  role             = aws_iam_role.${roleLabel}.arn
  runtime          = "${fn.runtime}"
  handler          = "${runtimeConfig.handler}"
  filename         = data.archive_file.${archiveLabel}.output_path
  source_code_hash = data.archive_file.${archiveLabel}.output_base64sha256

  depends_on = [aws_iam_role_policy_attachment.${attachLabel}]
}

resource "aws_cloudwatch_log_group" "${logLabel}" {
  name              = "/aws/lambda/\${aws_lambda_function.${resource.hclLabel}.function_name}"
  retention_in_days = 1
}`;
}
