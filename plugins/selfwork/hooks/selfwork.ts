#!/usr/bin/env bun
import { open, readFile, rename, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
/**
 * selfwork: Stop hook for autonomous task execution.
 *
 * Reads .claude/dispatch/active to find the current run, then reads
 * runs/<run-id>/state.json and decides whether Claude should continue
 * working (block) or stop.
 *
 * State machine:
 *   planning → analyzing → specifying → executing → completed
 *
 * Decision logic:
 *   1. stop_hook_active=true → allow stop (prevent infinite loop)
 *   2. No active file → allow stop
 *   3. status=completed → clear active pointer (if matching), allow stop
 *   4. status≠executing → allow stop (but check artifact gates for CEO phases)
 *   5. Tasks with status=agent_done and review pending → block: "review"
 *   6. Tasks with status=failed and retry budget left → block: "retry"
 *   7. Tasks with status=pending and deps done → block: "dispatch"
 *   8. All tasks done → mark state completed, clear active pointer, allow stop
 *   9. Permanent failed tasks with no running tasks → mark blocked, block stop
 *   10. Otherwise (tasks dispatched/running) → allow stop, wait for notification
 *
 * CEO orchestration additions:
 *   - State schema validation (run_id, plan, branch, status, tasks)
 *   - Artifact existence checks for phase transitions
 *   - TDD gate for critical TDD tasks
 *   - dev-report/review-report artifact validation
 */

interface Task {
  id: string;
  status?: "pending" | "dispatched" | "agent_done" | "reviewing" | "completed" | "failed";
  blocked_by?: string[];
  review_status?: "pending" | "approved" | "changes_requested";
  test_status?: "pending" | "pass" | "fail";
  retry_count?: number;
  title?: string;
  description?: string;
  agent?: string;
  agent_type?: string;
  complexity?: "easy" | "medium" | "hard";
  spec?: string;
  agent_id?: string | null;
  task_type?: "tdd" | "non_tdd";
  criticality?: "critical" | "normal";
  test_command?: string;
}

interface DispatchState {
  run_id?: string;
  plan?: string;
  spec_path?: string;
  branch?: string;
  status?: "planning" | "analyzing" | "specifying" | "executing" | "completed" | "blocked";
  spec_status?: "draft" | "approved" | "obsolete";
  max_retries?: number;
  tasks?: Task[];
}

interface StopHookInput {
  stop_hook_active: boolean;
  last_assistant_message?: string;
}

type ReviewMode = "legacy" | "reviewed" | "mixed";

const REPO_ROOT = resolve(process.cwd());
const DISPATCH_DIR = resolve(REPO_ROOT, ".claude/dispatch");
const ACTIVE_FILE = resolve(DISPATCH_DIR, "active");
const ACTIVE_LOCK_FILE = resolve(DISPATCH_DIR, "active.lock");
const DEFAULT_MAX_RETRIES = 2;
const LOCK_RETRY_ATTEMPTS = 4;
const LOCK_RETRY_DELAY_MS = 25;
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

// Valid status values per CEO orchestration model
const VALID_STATUSES = ["planning", "analyzing", "specifying", "executing", "completed", "blocked"];

function isValidRunId(runId: string): boolean {
  return runId.length > 0 && runId.length <= 128 && RUN_ID_PATTERN.test(runId) && !runId.includes("..");
}

function normalizeBlockedBy(task: Task): string[] {
  return Array.isArray(task.blocked_by) ? task.blocked_by : [];
}

function hasReviewField(task: Task): boolean {
  return Object.prototype.hasOwnProperty.call(task, "review_status");
}

function getReviewMode(tasks: Task[]): ReviewMode {
  const hasAnyReviewField = tasks.some((task) => hasReviewField(task));
  const allHaveReviewField = tasks.length > 0 && tasks.every((task) => hasReviewField(task));

  if (!hasAnyReviewField) {
    return "legacy";
  }

  return allHaveReviewField ? "reviewed" : "mixed";
}

function isTaskDone(task: Task, reviewMode: ReviewMode): boolean {
  if (task.status !== "completed") {
    return false;
  }

  if (reviewMode === "legacy") {
    return true;
  }

  if (reviewMode === "reviewed") {
    return task.review_status === "approved";
  }

  // Mixed mode: treat missing review_status as pending.
  if (!hasReviewField(task)) {
    return false;
  }

  return task.review_status === "approved";
}

function getMaxRetries(state: DispatchState): number {
  const retries = state.max_retries;
  return typeof retries === "number" && Number.isFinite(retries) && retries >= 0
    ? Math.floor(retries)
    : DEFAULT_MAX_RETRIES;
}

/**
 * Validate state.json has required fields per CEO schema.
 * Returns {ok: true} if valid, or {ok: false, reason: string} if invalid.
 */
function validateStateSchema(state: DispatchState): { ok: boolean; reason?: string } {
  if (!state.run_id || typeof state.run_id !== "string") {
    return { ok: false, reason: "State missing required field: run_id" };
  }
  if (!state.plan || typeof state.plan !== "string") {
    return { ok: false, reason: "State missing required field: plan" };
  }
  if (!state.branch || typeof state.branch !== "string") {
    return { ok: false, reason: "State missing required field: branch" };
  }
  if (!state.status || !VALID_STATUSES.includes(state.status)) {
    const validList = VALID_STATUSES.join("|");
    return { ok: false, reason: `State missing required field: status (must be one of ${validList})` };
  }
  if (!Array.isArray(state.tasks)) {
    return { ok: false, reason: "State missing required field: tasks (must be an array)" };
  }

  return { ok: true };
}

/**
 * Check artifact existence for CEO phase transitions.
 * Returns {ok: true} if all checks pass, or {ok: false, reason: string} if blocked.
 */
function checkArtifacts(runDir: string, state: DispatchState): { ok: boolean; reason?: string } {
  const status = state.status ?? "planning";

  // analyzing phase: require analysis-report.json
  if (status === "analyzing") {
    const analysisReportPath = resolve(runDir, "artifacts/analysis-report.json");
    if (!existsSync(analysisReportPath)) {
      return { ok: false, reason: "Analyst has not produced analysis-report.json yet" };
    }
  }

  // specifying phase: require plan.json and spec_status
  if (status === "specifying") {
    const planPath = resolve(runDir, "artifacts/plan.json");
    if (!existsSync(planPath)) {
      return { ok: false, reason: "Architect has not produced plan.json yet" };
    }
    if (!state.spec_status) {
      return { ok: false, reason: "spec_status must be set during specifying phase" };
    }
  }

  // executing phase: require spec_status === "approved"
  if (status === "executing") {
    if (state.spec_status !== "approved") {
      return { ok: false, reason: "spec_status must be approved before executing" };
    }
  }

  return { ok: true };
}

/**
 * Check TDD gate for critical TDD tasks.
 * Returns {ok: true} if all checks pass, or {ok: false, reason: string} if blocked.
 */
function checkTDDGate(tasks: Task[]): { ok: boolean; reason?: string } {
  for (const task of tasks) {
    if (
      task.status === "pending" &&
      task.task_type === "tdd" &&
      task.criticality === "critical" &&
      !task.test_command
    ) {
      return { ok: false, reason: `Critical TDD task ${task.id} missing test_command` };
    }
  }
  return { ok: true };
}

/**
 * Check dev-report and review-report artifacts for task status transitions.
 * Returns {ok: true} if all checks pass, or {ok: false, reason: string} if blocked.
 */
function checkReportArtifacts(runDir: string, tasks: Task[]): { ok: boolean; reason?: string } {
  for (const task of tasks) {
    const devReportPath = resolve(runDir, `artifacts/dev-report-${task.id}.json`);
    const reviewReportPath = resolve(runDir, `artifacts/review-report-${task.id}.json`);

    // When task status is agent_done or beyond, dev-report must exist
    if (task.status === "agent_done" || task.status === "reviewing" || task.status === "completed") {
      if (!existsSync(devReportPath)) {
        return { ok: false, reason: `Task ${task.id} status is ${task.status} but dev-report-${task.id}.json is missing` };
      }
    }

    // For task to be marked completed, review-report must exist
    if (task.status === "completed") {
      if (!existsSync(reviewReportPath)) {
        return { ok: false, reason: `Task ${task.id} is completed but review-report-${task.id}.json is missing` };
      }
    }
  }
  return { ok: true };
}

async function withActiveLock<T>(fn: () => Promise<T>): Promise<T | null> {
  let lockHandle: Awaited<ReturnType<typeof open>> | null = null;

  for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      lockHandle = await open(ACTIVE_LOCK_FILE, "wx");
      break;
    } catch {
      if (attempt === LOCK_RETRY_ATTEMPTS - 1) {
        return null;
      }

      await Bun.sleep(LOCK_RETRY_DELAY_MS);
    }
  }

  if (!lockHandle) {
    return null;
  }

  try {
    return await fn();
  } finally {
    try {
      await lockHandle.close();
    } catch {
      // Ignore close errors.
    }

    try {
      await unlink(ACTIVE_LOCK_FILE);
    } catch {
      // Ignore cleanup errors.
    }
  }
}

async function writeStateAtomically(stateFilePath: string, state: DispatchState): Promise<void> {
  const tmpPath = `${stateFilePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  await Bun.write(tmpPath, `${JSON.stringify(state, null, 2)}\n`);

  try {
    await rename(tmpPath, stateFilePath);
  } catch (error) {
    try {
      await unlink(tmpPath);
    } catch {
      // Ignore tmp cleanup errors.
    }

    throw error;
  }
}

async function clearActiveIfMatchingRun(runId: string): Promise<void> {
  if (!isValidRunId(runId)) {
    return;
  }

  await withActiveLock(async () => {
    let activeRunId = "";
    try {
      activeRunId = (await readFile(ACTIVE_FILE, "utf8")).trim();
    } catch {
      return;
    }

    if (activeRunId !== runId) {
      return;
    }

    const activeHandle = await open(ACTIVE_FILE, "r+");
    try {
      await activeHandle.truncate(0);
    } finally {
      await activeHandle.close();
    }
  });
}

async function main() {
  const raw = await Bun.stdin.text();
  let input: StopHookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  // Guard: prevent infinite loop.
  if (input.stop_hook_active) {
    process.exit(0);
  }

  // Read active run id.
  let runId = "";
  try {
    runId = (await readFile(ACTIVE_FILE, "utf8")).trim();
  } catch {
    process.exit(0);
  }

  if (!isValidRunId(runId)) {
    process.exit(0);
  }

  const stateFilePath = `${DISPATCH_DIR}/runs/${runId}/state.json`;
  const stateFile = Bun.file(stateFilePath);
  if (!(await stateFile.exists())) {
    process.exit(0);
  }

  let state: DispatchState;
  try {
    state = await stateFile.json();
  } catch {
    process.exit(0);
  }

  // NEW: Validate state schema per CEO model
  const schemaValidation = validateStateSchema(state);
  if (!schemaValidation.ok) {
    output({
      decision: "block",
      reason: `[selfwork] State validation failed: ${schemaValidation.reason}`,
    });
    return;
  }

  // NEW: Artifact existence checks for CEO phase transitions
  const runDir = `${DISPATCH_DIR}/runs/${runId}`;
  const artifactCheck = checkArtifacts(runDir, state);
  if (!artifactCheck.ok) {
    output({
      decision: "block",
      reason: `[selfwork] ${artifactCheck.reason}`,
    });
    return;
  }

  await handleState(state, stateFilePath, runId, runDir);
}

async function handleState(state: DispatchState, stateFilePath: string, runId: string, runDir: string) {
  const runStatus = state.status ?? "planning";

  if (runStatus === "completed") {
    await clearActiveIfMatchingRun(runId);
    process.exit(0);
  }

  // Only orchestrate in executing state.
  if (runStatus !== "executing") {
    process.exit(0);
  }

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const reviewMode = getReviewMode(tasks);
  const maxRetries = getMaxRetries(state);

  // NEW: TDD gate - check critical TDD tasks have test_command
  const tddGate = checkTDDGate(tasks);
  if (!tddGate.ok) {
    output({
      decision: "block",
      reason: `[selfwork] TDD gate: ${tddGate.reason}`,
    });
    return;
  }

  // NEW: Check dev-report and review-report artifacts
  const reportCheck = checkReportArtifacts(runDir, tasks);
  if (!reportCheck.ok) {
    output({
      decision: "block",
      reason: `[selfwork] ${reportCheck.reason}`,
    });
    return;
  }

  const doneIds = new Set(tasks.filter((task) => isTaskDone(task, reviewMode)).map((task) => task.id));

  // 1) Tasks that still require review.
  const needsReview = tasks.filter((task) => {
    if (task.status === "agent_done") {
      return (task.review_status ?? "pending") === "pending";
    }

    if (reviewMode === "legacy") {
      return false;
    }

    return task.status === "completed" && (task.review_status ?? "pending") === "pending";
  });

  // 2) Failed tasks that still have retry budget.
  const needsRetry = tasks.filter(
    (task) => task.status === "failed" && (task.retry_count ?? 0) < maxRetries,
  );

  // 3) Pending tasks whose dependencies are all done.
  const needsDispatch = tasks.filter(
    (task) =>
      task.status === "pending" &&
      normalizeBlockedBy(task).every((dep) => doneIds.has(dep)),
  );

  // 4) Check if all tasks are done.
  const allDone = tasks.length > 0 && tasks.every((task) => isTaskDone(task, reviewMode));

  const dispatched = tasks.filter((task) => task.status === "dispatched");
  const permFailed = tasks.filter(
    (task) => task.status === "failed" && (task.retry_count ?? 0) >= maxRetries,
  );

  if (needsReview.length > 0) {
    const ids = needsReview.map((task) => task.id).join(", ");
    output({
      decision: "block",
      reason: [
        `[selfwork] Review & test completed agent work: ${ids}`,
        "Steps: 1) Read active run's state.json",
        "2) Read each agent file in runs/<run-id>/agents/<id>.json",
        "3) Run bun run test:run (or scoped impacted tests)",
        "4) If pass: update task status→completed, review_status→approved",
        "5) If fail: dispatch fix agent (sonnet-dev), update status→failed",
        "6) Write updated state.json",
      ].join("\n"),
    });
    return;
  }

  if (needsRetry.length > 0) {
    const ids = needsRetry.map((task) => task.id).join(", ");
    output({
      decision: "block",
      reason: [
        `[selfwork] Retry failed tasks: ${ids}`,
        "Steps: 1) Read active run's state.json and agent files",
        "2) Re-dispatch with fix instructions to sonnet-dev",
        "3) Increment retry_count, update status→dispatched",
        "4) Write updated state.json and agent file",
      ].join("\n"),
    });
    return;
  }

  if (needsDispatch.length > 0) {
    const ids = needsDispatch.map((task) => task.id).join(", ");
    output({
      decision: "block",
      reason: [
        `[selfwork] Dispatch unblocked tasks: ${ids}`,
        "Steps: 1) Read active run's state.json",
        "2) For each task: read .claude/task-specs/<run-id>/subtasks/<id>.md",
        "3) Launch Agent with sonnet-dev or haiku-dev",
        "4) Record agent_id, update status→dispatched",
        "5) Write updated state.json and agent files",
      ].join("\n"),
    });
    return;
  }

  if (allDone) {
    state.status = "completed";
    await writeStateAtomically(stateFilePath, state);
    await clearActiveIfMatchingRun(runId);
    process.exit(0);
  }

  if (permFailed.length > 0 && dispatched.length === 0) {
    state.status = "blocked";
    await writeStateAtomically(stateFilePath, state);
    output({
      decision: "block",
      reason: [
        `[selfwork] BLOCKED: ${permFailed.length} task(s) failed after max retries: ${permFailed
          .map((task) => task.id)
          .join(", ")}`,
        "Notify user and wait for manual intervention.",
      ].join("\n"),
    });
    return;
  }

  // Default: allow stop while waiting for running/dispatched tasks.
  process.exit(0);
}

function output(obj: { decision: string; reason: string }) {
  console.log(JSON.stringify(obj));
}

main().catch(() => process.exit(0));
