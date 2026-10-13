# What failed, and what I changed

## Derived identifiers inherited a uniqueness they never had

The generator deduped each resource's primary name. The Lambda execution role
name was then derived from the finished function name in the emitter —
`<function>-role`, trimmed to IAM's 64 characters. Deriving an identifier from a
unique one does not make it unique, and it broke two ways:

**Truncation erased the discriminator.** The name is trimmed to 59 characters to
make room for `-role`, and the dedupe suffix (`-2`) sits at the end — exactly
what the trim removes. Two functions collapsed to one role name.

**IAM compares role names case-insensitively; Lambda does not.**
`Process Orders` and `process orders` are two valid, distinct functions. Their
roles, `Process-Orders-role` and `process-orders-role`, are one role to IAM.

Both raise `EntityAlreadyExists` on `CreateRole`.

**Fixed** by allocating role names in the planning pass from a single
case-insensitive registry, with the discriminator inserted *before* `-role` so
the trim cannot remove it. Two regression tests cover each mode.

The general point: every derived name needs its own uniqueness domain, because
each service has its own rules — S3 globally unique and lowercase, SQS
per-account, Lambda case-sensitive, IAM case-insensitive and account-wide. One
dedupe pass cannot satisfy four.

## Both defects passed validation

`validate` and `plan` accept both collisions; AWS only compares the names at
apply. That is why I tested with adversarial input — duplicates, >64-character
names, case variants, reserved S3 prefixes — rather than the example, which has
one resource of each type and no duplicates and would have hidden both.

## Deployment evidence is complete

The final run used sandbox account `495398516629` and captured all graded steps
in order. `tofu apply` completed with **6 resources added**, the second
`tofu plan -detailed-exitcode` returned **0** with **No changes**, and
`tofu destroy` completed with **6 resources destroyed**.

The post-run AWS reality check confirms cleanup is complete: S3 bucket, Lambda,
IAM role, CloudWatch log group, and SQS queue are all gone. The local
`terraform.tfstate` remains as execution evidence, but infrastructure state in
AWS is clean.

This closes the deployment bar in the brief:

- deploys successfully
- second plan reports no changes
- tears down cleanly

Earlier blocked runs (SCP and PassRole denial) were retained in prior logs for
audit context, but they are no longer the final outcome.
