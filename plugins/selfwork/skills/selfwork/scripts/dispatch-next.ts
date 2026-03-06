#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

type TaskStatus = 'pending' | 'dispatched' | 'agent_done' | 'reviewing' | 'completed' | 'failed'
type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'blocked'
type RunStatus = 'planning' | 'intent_recognition' | 'info_collecting' | 'analyzing' | 'designing' | 'specifying' | 'executing' | 'completed' | 'blocked'

type Task = {
  id: string
  title?: string
  status?: TaskStatus
  blocked_by?: string[]
  review_status?: ReviewStatus
  retry_count?: number
  complexity?: 'small' | 'medium' | 'hard'
  agent_type?: string
  task_type?: 'tdd' | 'non_tdd'
  criticality?: 'critical' | 'normal'
}

type RunState = {
  run_id?: string
  status?: RunStatus
  spec_status?: 'draft' | 'approved' | 'obsolete'
  max_retries?: number
  tasks?: Task[]
}

type NextInstruction = {
  action: 'none' | 'dispatch_subagent' | 'await_human_gate' | 'blocked'
  phase: 'bootstrap' | 'planning' | 'intent_recognition' | 'info_collecting' | 'analyzing' | 'designing' | 'specifying' | 'dispatch' | 'review' | 'retry' | 'completed' | 'blocked'
  run_id: string | null
  subagent_type?: string
  task_ids?: string[]
  mode?: 'serial' | 'parallel'
  notes: string[]
}

const REPO_ROOT = resolve(process.cwd())
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')
const DEFAULT_MAX_RETRIES = 2
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/

function isValidRunId(runId: string) {
  return runId.length > 0 && runId.length <= 128 && RUN_ID_PATTERN.test(runId) && !runId.includes('..')
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function normalizeBlockedBy(task: Task) {
  return Array.isArray(task.blocked_by) ? task.blocked_by : []
}

function hasReviewField(task: Task) {
  return Object.prototype.hasOwnProperty.call(task, 'review_status')
}

function getReviewMode(tasks: Task[]) {
  const hasAnyReviewField = tasks.some((task) => hasReviewField(task))
  const allHaveReviewField = tasks.length > 0 && tasks.every((task) => hasReviewField(task))

  if (!hasAnyReviewField) {
    return 'legacy' as const
  }

  return allHaveReviewField ? ('reviewed' as const) : ('mixed' as const)
}

function isTaskDone(task: Task, reviewMode: 'legacy' | 'reviewed' | 'mixed') {
  if (task.status !== 'completed') {
    return false
  }

  if (reviewMode === 'legacy') {
    return true
  }

  if (reviewMode === 'reviewed') {
    return task.review_status === 'approved'
  }

  return hasReviewField(task) && task.review_status === 'approved'
}

function getAgentType(task: Task) {
  if (task.agent_type) {
    return task.agent_type
  }
  return task.complexity === 'small' ? 'haiku-dev' : 'sonnet-dev'
}

async function main() {
  if (!existsSync(ACTIVE_FILE)) {
    print({
      ok: true,
      instruction: {
        action: 'none',
        phase: 'bootstrap',
        run_id: null,
        notes: ['No active run. Run bootstrap.ts before orchestration.'],
      } satisfies NextInstruction,
    })
    return
  }

  const runId = (await readFile(ACTIVE_FILE, 'utf8')).trim()
  if (!isValidRunId(runId)) {
    print({
      ok: false,
      instruction: {
        action: 'blocked',
        phase: 'blocked',
        run_id: null,
        notes: ['Active run id is invalid.'],
      } satisfies NextInstruction,
    })
    process.exitCode = 1
    return
  }

  const statePath = resolve(RUNS_DIR, runId, 'state.json')
  const state = await readJson<RunState>(statePath)
  if (!state) {
    print({
      ok: false,
      instruction: {
        action: 'blocked',
        phase: 'blocked',
        run_id: runId,
        notes: ['state.json is missing or invalid.'],
      } satisfies NextInstruction,
    })
    process.exitCode = 1
    return
  }

  const status = state.status ?? 'planning'
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const maxRetries = typeof state.max_retries === 'number' ? state.max_retries : DEFAULT_MAX_RETRIES

  if (status === 'planning') {
    print({ ok: true, instruction: { action: 'none', phase: 'planning', run_id: runId, notes: ['Planning is active. Continue requirement intake and initialize run metadata.'] } satisfies NextInstruction })
    return
  }

  if (status === 'intent_recognition') {
    print({ ok: true, instruction: { action: 'none', phase: 'intent_recognition', run_id: runId, notes: ['Determine whether the request is already clear enough to skip research/design.'] } satisfies NextInstruction })
    return
  }

  if (status === 'info_collecting') {
    print({ ok: true, instruction: { action: 'dispatch_subagent', phase: 'info_collecting', run_id: runId, subagent_type: 'info-collector', mode: 'serial', notes: ['Dispatch info-collector to produce info-collection.json.'] } satisfies NextInstruction })
    return
  }

  if (status === 'analyzing') {
    print({ ok: true, instruction: { action: 'dispatch_subagent', phase: 'analyzing', run_id: runId, subagent_type: 'requirement-analyst', mode: 'serial', notes: ['Dispatch requirement-analyst to produce requirement-analysis.json.'] } satisfies NextInstruction })
    return
  }

  if (status === 'designing') {
    print({ ok: true, instruction: { action: 'dispatch_subagent', phase: 'designing', run_id: runId, subagent_type: 'product-designer', mode: 'serial', notes: ['Dispatch product-designer to produce product-spec outputs.'] } satisfies NextInstruction })
    return
  }

  if (status === 'specifying') {
    const planPath = resolve(RUNS_DIR, runId, 'artifacts', 'plan.json')

    if (!existsSync(planPath)) {
      print({ ok: true, instruction: { action: 'dispatch_subagent', phase: 'specifying', run_id: runId, subagent_type: 'architect', mode: 'serial', notes: ['Dispatch architect to produce the spec document and plan.json.'] } satisfies NextInstruction })
      return
    }

    if (state.spec_status !== 'approved') {
      print({ ok: true, instruction: { action: 'await_human_gate', phase: 'specifying', run_id: runId, notes: ['Specification artifacts are ready and waiting for spec approval or rework.'] } satisfies NextInstruction })
      return
    }

    print({ ok: true, instruction: { action: 'none', phase: 'specifying', run_id: runId, notes: ['Specification approved. Sync tasks and transition to executing.'] } satisfies NextInstruction })
    return
  }

  if (status === 'completed') {
    print({ ok: true, instruction: { action: 'none', phase: 'completed', run_id: runId, notes: ['Run is completed.'] } satisfies NextInstruction })
    return
  }

  if (status === 'blocked') {
    print({ ok: true, instruction: { action: 'blocked', phase: 'blocked', run_id: runId, notes: ['Run is blocked and requires manual intervention.'] } satisfies NextInstruction })
    return
  }

  const reviewMode = getReviewMode(tasks)
  const doneIds = new Set(tasks.filter((task) => isTaskDone(task, reviewMode)).map((task) => task.id))

  const needsReview = tasks.filter((task) => {
    if (task.status === 'agent_done') {
      return (task.review_status ?? 'pending') === 'pending'
    }
    if (reviewMode === 'legacy') {
      return false
    }
    return task.status === 'completed' && (task.review_status ?? 'pending') === 'pending'
  })

  if (needsReview.length > 0) {
    print({
      ok: true,
      instruction: {
        action: 'dispatch_subagent',
        phase: 'review',
        run_id: runId,
        task_ids: needsReview.map((task) => task.id),
        subagent_type: 'code-reviewer',
        mode: needsReview.length > 1 ? 'parallel' : 'serial',
        notes: ['Dispatch code-reviewer for each reviewable task.'],
      } satisfies NextInstruction,
    })
    return
  }

  const needsRetry = tasks.filter((task) => task.status === 'failed' && (task.retry_count ?? 0) < maxRetries)
  if (needsRetry.length > 0) {
    print({
      ok: true,
      instruction: {
        action: 'dispatch_subagent',
        phase: 'retry',
        run_id: runId,
        task_ids: needsRetry.map((task) => task.id),
        subagent_type: 'sonnet-dev',
        mode: needsRetry.length > 1 ? 'parallel' : 'serial',
        notes: ['Re-dispatch retryable failed tasks to sonnet-dev with failure context.'],
      } satisfies NextInstruction,
    })
    return
  }

  const needsDispatch = tasks.filter(
    (task) => task.status === 'pending' && normalizeBlockedBy(task).every((dep) => doneIds.has(dep)),
  )

  if (needsDispatch.length > 0) {
    const hasMixedAgents = new Set(needsDispatch.map(getAgentType)).size > 1
    print({
      ok: true,
      instruction: {
        action: 'dispatch_subagent',
        phase: 'dispatch',
        run_id: runId,
        task_ids: needsDispatch.map((task) => task.id),
        subagent_type: hasMixedAgents ? 'developer-by-complexity' : getAgentType(needsDispatch[0]),
        mode: needsDispatch.length > 1 ? 'parallel' : 'serial',
        notes: ['Dispatch pending tasks whose dependencies are satisfied. Use haiku-dev for small tasks and sonnet-dev for medium/hard tasks.'],
      } satisfies NextInstruction,
    })
    return
  }

  print({
    ok: true,
    instruction: {
      action: 'none',
      phase: 'dispatch',
      run_id: runId,
      notes: ['No immediate dispatch action. Wait for running subagents or new state changes.'],
    } satisfies NextInstruction,
  })
}

function print(obj: unknown) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
}

void main()
