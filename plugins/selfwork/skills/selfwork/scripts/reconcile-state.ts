#!/usr/bin/env bun
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

type RunStatus = 'planning' | 'intent_recognition' | 'info_collecting' | 'analyzing' | 'designing' | 'specifying' | 'executing' | 'completed' | 'blocked'
type TaskStatus = 'pending' | 'dispatching' | 'dispatched' | 'agent_done' | 'reviewing' | 'completed' | 'failed'
type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'blocked'

type Task = {
  id: string
  title?: string
  status?: TaskStatus
  blocked_by?: string[]
  review_status?: ReviewStatus
  retry_count?: number
  complexity?: 'small' | 'medium' | 'hard'
  agent_type?: string
  agent_id?: string | null
  task_type?: 'tdd' | 'non_tdd'
  criticality?: 'critical' | 'normal'
  test_command?: string
  dispatch_count?: number
  last_artifact?: string | null
  last_error?: string | null
  updated_at?: string
}

type GateStatus = 'draft' | 'approved' | 'obsolete'

type RunState = {
  run_id?: string
  status?: RunStatus
  design_status?: GateStatus
  spec_status?: GateStatus
  spec_path?: string | null
  blocked_reason?: string | null
  updated_at?: string
  current_instruction?: unknown
  last_instruction?: unknown
  max_retries?: number
  tasks?: Task[]
}

type DevReport = {
  run_id?: string
  task_id?: string
  test_result?: 'pass' | 'fail' | 'skipped'
}

type ReviewIssue = {
  description?: string
}

type ReviewReport = {
  run_id?: string
  task_id?: string
  verdict?: 'approved' | 'changes_requested' | 'blocked'
  issues?: ReviewIssue[]
  test_result?: 'pass' | 'fail' | 'skipped'
}

type ProductSpec = {
  spec_path?: string
}

const REPO_ROOT = resolve(process.cwd())
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')

function now() {
  return new Date().toISOString()
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeJsonAtomically(path: string, value: unknown) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`)
  try {
    await rename(tmp, path)
  } catch (error) {
    try {
      await unlink(tmp)
    } catch {}
    throw error
  }
}

function artifactPath(runId: string, name: string) {
  return resolve(RUNS_DIR, runId, 'artifacts', name)
}

function resolveSpecPath(state: RunState) {
  if (!state.spec_path) {
    return null
  }
  return resolve(REPO_ROOT, state.spec_path)
}

function firstIssueDescription(report: ReviewReport | null) {
  const first = report?.issues?.find((issue) => typeof issue.description === 'string' && issue.description.trim().length > 0)
  return first?.description?.trim() ?? null
}

async function reconcilePhase(state: RunState, runId: string, transitions: string[]) {
  const current = state.status ?? 'planning'

  if (current === 'info_collecting' && existsSync(artifactPath(runId, 'info-collection.json'))) {
    state.status = 'analyzing'
    transitions.push('status info_collecting -> analyzing')
  }

  if (state.status === 'analyzing' && existsSync(artifactPath(runId, 'requirement-analysis.json'))) {
    state.status = 'designing'
    transitions.push('status analyzing -> designing')
  }

  if (state.status === 'designing' && existsSync(artifactPath(runId, 'product-spec.json'))) {
    const productSpec = await readJson<ProductSpec>(artifactPath(runId, 'product-spec.json'))
    if (productSpec?.spec_path) {
      state.spec_path = productSpec.spec_path
    }

    const resolvedSpecPath = resolveSpecPath(state)
    if (resolvedSpecPath && existsSync(resolvedSpecPath) && (state.design_status ?? 'draft') === 'approved') {
      state.status = 'specifying'
      transitions.push('status designing -> specifying')
    }
  }

  if (state.status === 'specifying') {
    const resolvedSpecPath = resolveSpecPath(state)
    if (
      existsSync(artifactPath(runId, 'plan.json')) &&
      resolvedSpecPath &&
      existsSync(resolvedSpecPath) &&
      state.spec_status === 'approved'
    ) {
      state.status = 'executing'
      transitions.push('status specifying -> executing')
    }
  }
}

async function reconcileTasks(state: RunState, runId: string, transitions: string[]) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  let hasFailed = false
  let hasInFlight = false

  for (const task of tasks) {
    const devReportPath = artifactPath(runId, `dev-report-${task.id}.json`)
    const reviewReportPath = artifactPath(runId, `review-report-${task.id}.json`)

    if (task.status === 'dispatched' && existsSync(devReportPath)) {
      const devReport = await readJson<DevReport>(devReportPath)
      task.status = 'agent_done'
      task.last_artifact = devReportPath
      task.last_error = devReport?.test_result === 'fail' ? 'Developer report recorded failing tests' : null
      task.updated_at = now()
      transitions.push(`task ${task.id}: dispatched -> agent_done`)
    }

    if ((task.status === 'reviewing' || task.status === 'agent_done' || task.status === 'completed') && existsSync(reviewReportPath)) {
      const reviewReport = await readJson<ReviewReport>(reviewReportPath)
      const verdict = reviewReport?.verdict
      task.last_artifact = reviewReportPath
      task.updated_at = now()

      if (verdict === 'approved') {
        task.status = 'completed'
        task.review_status = 'approved'
        task.last_error = null
        transitions.push(`task ${task.id}: review -> completed`)
      } else if (verdict === 'changes_requested') {
        task.status = 'failed'
        task.review_status = 'changes_requested'
        task.last_error = firstIssueDescription(reviewReport) ?? 'Review requested changes'
        transitions.push(`task ${task.id}: review -> failed(changes_requested)`)
      } else if (verdict === 'blocked') {
        task.status = 'failed'
        task.review_status = 'blocked'
        task.last_error = firstIssueDescription(reviewReport) ?? 'Review blocked task'
        transitions.push(`task ${task.id}: review -> failed(blocked)`)
      }
    }

    if (task.status === 'failed') {
      hasFailed = true
    }

    if (task.status === 'dispatched' || task.status === 'reviewing' || task.status === 'agent_done') {
      hasInFlight = true
    }
  }

  if (tasks.length > 0 && tasks.every((task) => task.status === 'completed' && task.review_status === 'approved')) {
    state.status = 'completed'
    state.blocked_reason = null
    transitions.push('status executing -> completed')
    return
  }

  if (!hasInFlight && hasFailed) {
    state.status = 'blocked'
    state.blocked_reason = 'One or more tasks failed and require manual intervention or retry dispatch.'
    transitions.push('status executing -> blocked')
  }
}

async function main() {
  if (!existsSync(ACTIVE_FILE)) {
    process.stdout.write(`${JSON.stringify({ ok: true, changed: false, reason: 'No active run.' }, null, 2)}\n`)
    return
  }

  const runId = (await readFile(ACTIVE_FILE, 'utf8')).trim()
  const statePath = resolve(RUNS_DIR, runId, 'state.json')
  const state = await readJson<RunState>(statePath)

  if (!state) {
    process.stdout.write(`${JSON.stringify({ ok: false, changed: false, reason: 'state.json is missing or invalid.' }, null, 2)}\n`)
    process.exitCode = 1
    return
  }

  const before = JSON.stringify(state)
  const transitions: string[] = []

  await reconcilePhase(state, runId, transitions)

  if (state.status === 'executing') {
    await reconcileTasks(state, runId, transitions)
  }

  const after = JSON.stringify(state)
  const changed = before !== after
  if (changed) {
    state.updated_at = now()
    await writeJsonAtomically(statePath, state)
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        changed,
        run_id: runId,
        status: state.status ?? null,
        transitions,
      },
      null,
      2,
    )}\n`,
  )
}

void main()
