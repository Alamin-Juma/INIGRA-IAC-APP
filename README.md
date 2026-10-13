# JSON to OpenTofu generator

## What is implemented

- TypeScript CLI that reads JSON from a file path argument or stdin.
- Deterministic `main.tf` generation for:
  - S3 bucket (`object-store`)
  - SQS queue (`queue`)
  - Lambda function (`function`)
- Per-service naming normalization.
- Deterministic duplicate-name handling per resource type.
- Lambda packaging via `archive_file` with `source_code_hash`.
- CloudWatch log group declared for clean destroy ownership.

## Run

```bash
npm install
npm test
node dist/src/index.js example-input.json
```

Or via scripts:

```bash
npm run gen -- example-input.json
```

## Output

- Generated file: `main.tf` in this folder.
- Example input: `example-input.json`.
- Tests: `test/generator.test.ts`.
