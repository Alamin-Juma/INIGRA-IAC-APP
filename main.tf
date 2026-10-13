terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_s3_bucket" "reports_archive" {
  bucket = "reports-archive-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"
}

resource "aws_sqs_queue" "Order_Events" {
  name = "Order-Events"
}

resource "aws_iam_role" "Process_Orders_role" {
  name = "Process-Orders-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "Process_Orders_basic" {
  role       = aws_iam_role.Process_Orders_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "Process_Orders_zip" {
  type        = "zip"
  output_path = "${path.module}/Process_Orders.zip"

  source {
    filename = "index.py"
    content  = <<-EOT
def handler(event, context):
    return {"statusCode": 200, "body": "ok"}
EOT
  }
}

resource "aws_lambda_function" "Process_Orders" {
  function_name    = "Process-Orders"
  role             = aws_iam_role.Process_Orders_role.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.Process_Orders_zip.output_path
  source_code_hash = data.archive_file.Process_Orders_zip.output_base64sha256

  depends_on = [aws_iam_role_policy_attachment.Process_Orders_basic]
}

resource "aws_cloudwatch_log_group" "Process_Orders_logs" {
  name              = "/aws/lambda/${aws_lambda_function.Process_Orders.function_name}"
  retention_in_days = 1
}
