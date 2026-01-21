---
name: cancel
description: "Cancel active loop-mode feature development"
version: 1.0.0
context: fork
allowed-tools:
  - Read
  - Write
  - Bash
parameters:
  - name: feature-name
    required: false
    description: "Feature to cancel (if omitted, shows list)"
---

# Cancel Loop Mode

Cancel an active loop-mode feature development.

## Usage

### Cancel specific feature:
```bash
/smart-dev:cancel {feature-name}
```

### List active loop features:
```bash
/smart-dev:cancel
```
(without feature name)

## Steps

### If feature-name provided:

1. **Validate feature exists**:
   ```bash
   if [ ! -f ".works/spec/{feature-name}/progress.md" ]; then
     echo "Error: Feature {feature-name} not found"
     exit 1
   fi
   ```

2. **Update progress.md**:
   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/scripts/update-progress.sh {feature-name} \
     --set-field status=canceled
   ```

3. **Output confirmation**:
   ```text
   ✓ Feature {feature-name} canceled
   ```

4. **Workspace preserved**:
   - All files in `.works/spec/{feature-name}/` remain intact
   - Can resume later by changing status back to previous value

### If feature-name NOT provided:

1. **List all active loop features**:
   ```bash
   find .works/spec -name "progress.md" -type f | while read f; do
     mode=$(grep "^mode:" "$f" | awk '{print $2}')
     status=$(grep "^status:" "$f" | awk '{print $2}')
     if [[ "$mode" == "loop" ]] && [[ "$status" != "completed" ]] && [[ "$status" != "canceled" ]]; then
       feature_name=$(basename $(dirname "$f"))
       iteration=$(grep "^iteration:" "$f" | awk '{print $2}')
       max_iter=$(grep "^max_iterations:" "$f" | awk '{print $2}')
       echo "$feature_name (iteration $iteration/$max_iter, status: $status)"
     fi
   done
   ```

2. **Prompt user to specify**:
   ```text
   Active loop features:
   - feature-name-1 (iteration 5/20, status: implementing)
   - feature-name-2 (iteration 2/20, status: collecting)

   Usage: /smart-dev:cancel {feature-name}
   ```

## Effect

- Stop hook will detect `status: canceled` and allow exit
- Loop iterations will halt immediately
- Feature workspace preserved (can resume later if needed)

## To Resume Canceled Feature

1. **Check current state**:
   ```bash
   cat .works/spec/{feature-name}/progress.md
   ```

2. **Determine previous status**:
   - Look at `spec_locked`, `last_verification_status`, etc.
   - Decide what status to restore (collecting/implementing/fixing)

3. **Update status**:
   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/scripts/update-progress.sh {feature-name} \
     --set-field status={previous-status}
   ```

4. **Restart loop**:
   ```bash
   /smart-dev:loop "{feature description}"
   ```
   (It will detect existing workspace and resume)

## Example

```bash
# Cancel active feature
/smart-dev:cancel user-authentication

# Output:
# ✓ Feature user-authentication canceled
#
# Workspace preserved at: .works/spec/user-authentication/
# To resume: Update status in progress.md and restart loop
```

## Important Notes

- Canceling does NOT delete any files
- Canceling does NOT undo git commits (if any were made)
- Stop hook will allow exit once status is set to "canceled"
- Can cancel at any iteration, any status (collecting/implementing/fixing)
- To permanently remove: `rm -rf .works/spec/{feature-name}/`

## State Transition

```text
Any loop status (collecting/implementing/fixing/blocked)
         |
         | [/smart-dev:cancel]
         v
    canceled (Stop hook allows exit)
```

## Alternative: Emergency Exit

If cancel command doesn't work (e.g., feature name wrong):

1. **Find feature directory**:
   ```bash
   ls .works/spec/
   ```

2. **Manually update status**:
   ```bash
   # Edit progress.md manually
   # Change: status: in_progress
   # To: status: canceled
   ```

3. **Stop hook will detect change** and allow exit on next stop attempt

## Troubleshooting

**Q: Cancel command runs but loop doesn't stop**
A: Check that status was actually updated in progress.md. Stop hook reads this file.

**Q: Want to cancel multiple features at once**
A: Run cancel command for each feature separately. No bulk cancel currently.

**Q: Accidentally canceled, want to undo**
A: Just update status back to previous value in progress.md and restart loop.

**Q: Loop continues even after cancel**
A: Make sure you're canceling the correct feature name. List active features first with `/smart-dev:cancel` (no args).
