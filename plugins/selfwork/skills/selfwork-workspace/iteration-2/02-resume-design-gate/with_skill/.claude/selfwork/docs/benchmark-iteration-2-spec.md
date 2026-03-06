# Benchmark Iteration 2 Product Spec

## Goal
Keep the run at the design confirmation gate after design artifacts have been produced.

## User Flow
- Product designer has already generated the design package.
- The orchestrator resumes the active run.
- The orchestrator detects that product-spec.json and the design document already exist.
- The orchestrator waits for explicit human confirmation before moving to specifying.

## Acceptance Criteria
- The run remains in `designing` while `design_status` is `draft`.
- The next action is `await_human_gate`.
- No automatic architect dispatch occurs yet.
