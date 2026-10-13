#!/usr/bin/env bash
# Captures the three console outputs the brief asks for, in order.
#
# Exit codes are read from PIPESTATUS[0], not $?. After a `tee` pipeline $?
# is TEE's status, so a failed apply would be recorded as exit=0 -- evidence
# that says the opposite of what happened.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
export AWS_PROFILE=sandbox
mkdir -p evidence

step() {                       # step <file> <title> <cmd...>
  local f="evidence/$1"; shift
  local title="$1"; shift
  { echo "### $title"; echo "\$ $*"; echo; } > "$f"
  "$@" 2>&1 | tee -a "$f"
  local rc=${PIPESTATUS[0]}
  echo "" | tee -a "$f"
  echo "exit code: $rc" | tee -a "$f"
  return "$rc"
}

step 00-account.txt "account under test" aws sts get-caller-identity
step 01-init.txt    "tofu init"     tofu init -no-color -input=false
step 02-validate.txt "tofu validate" tofu validate -no-color
step 03-apply.txt   "tofu apply"    tofu apply -no-color -input=false -auto-approve
APPLY_RC=$?

# -detailed-exitcode: 0 = no changes, 1 = error, 2 = changes present.
# The brief's bar is that this reports NO changes, so 0 is the only pass.
step 04-plan-after-apply.txt "tofu plan (second plan -- must report no changes)" \
  tofu plan -no-color -input=false -detailed-exitcode
PLAN_RC=$?

step 05-destroy.txt "tofu destroy" tofu destroy -no-color -input=false -auto-approve
DESTROY_RC=$?

echo
echo "===== SUMMARY ====="
echo "apply    exit : $APPLY_RC   (0 = ok)"
echo "2nd plan exit : $PLAN_RC   (0 = NO CHANGES, 2 = drift)"
echo "destroy  exit : $DESTROY_RC   (0 = ok)"
