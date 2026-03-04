#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(process.cwd())
const DISPATCH_DIR = resolve(REPO_ROOT, '.claude/dispatch')
const ACTIVE_FILE = resolve(DISPATCH_DIR, 'active')
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/

const TASK_STATUSES = new Set([
  'pending',
  'dispatched',
  'agent_done',
  'reviewing',
  'completed',
  'failed',
] as const)

const RUN_STATUSES = new Set(['planning', 'executing', 'completed', 'blocked'] as const)

type Task = {
  id: string
  status?: string
  blocked_by?: string[]
  review_status?: string
  test_status?: string
  title?: string
  description?: string
  agent?: string
  agent_type?: string
}

type RunState = {
  run_id?: string
  status?: string
  tasks?: Task[]
}

type DependencyIssue = { task: string; missingDep: string }
type Blocker = { task: string; waitingOn: string[] }
type ReviewMode = 'legacy' | 'reviewed' | 'mixed'

function isValidRunId(runId: string) {
  return runId.length > 0 && runId.length <= 128 && RUN_ID_PATTERN.test(runId) && !runId.includes('..')
}

function print(obj: unknown) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
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

function isTaskDone(task: Task, reviewMode: ReviewMode) {
  if (task.status !== 'completed') {
    return false
  }

  if (reviewMode === 'legacy') {
    return true
  }

  if (reviewMode === 'reviewed') {
    return task.review_status === 'approved'
  }

  // Mixed mode: follow normalization guidance. Missing review_status => pending.
  if (!hasReviewField(task)) {
    return false
  }

  return task.review_status === 'approved'
}

function findDependencyCycles(tasks: Task[], taskIds: Set<string>) {
  const depsById = new Map(
    tasks.map((task) => [
      task.id,
      normalizeBlockedBy(task).filter((dep) => taskIds.has(dep)),
    ]),
  )

  const color = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const cycles: string[] = []
  const cycleKeys = new Set<string>()

  for (const task of tasks) {
    color.set(task.id, 0)
  }

  const dfs = (id: string) => {
    color.set(id, 1)
    stack.push(id)

    for (const dep of depsById.get(id) ?? []) {
      const depColor = color.get(dep) ?? 0
      if (depColor === 0) {
        dfs(dep)
        continue
      }

      if (depColor === 1) {
        const startIndex = stack.lastIndexOf(dep)
        const cyclePath = [...stack.slice(startIndex), dep]
        const key = cyclePath.join(' -> ')
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key)
          cycles.push(key)
        }
      }
    }

    stack.pop()
    color.set(id, 2)
  }

  for (const task of tasks) {
    if ((color.get(task.id) ?? 0) === 0) {
      dfs(task.id)
    }
  }

  return cycles
}

async function main() {
  let runId = ''
  try {
    runId = (await readFile(ACTIVE_FILE, 'utf8')).trim()
  } catch {
    print({
      ok: true,
      activeRun: null,
      message: 'No active run',
    })
    return
  }

  if (!isValidRunId(runId)) {
    print({ ok: false, error: 'active run id is invalid', runId })
    process.exitCode = 1
    return
  }

  const statePath = `${DISPATCH_DIR}/runs/${runId}/state.json`
  const state = await readJson<RunState>(statePath)
  if (!state) {
    print({ ok: false, error: 'state.json missing or invalid', runId, statePath })
    process.exitCode = 1
    return
  }

  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const taskIds = new Set(tasks.map((task) => task.id))

  const missingDepRefs: DependencyIssue[] = []
  for (const task of tasks) {
    for (const dep of normalizeBlockedBy(task)) {
      if (!taskIds.has(dep)) {
        missingDepRefs.push({ task: task.id, missingDep: dep })
      }
    }
  }

  const dependencyCycles = findDependencyCycles(tasks, taskIds)

  const hasAnyReviewField = tasks.some((task) => hasReviewField(task))
  const allHaveReviewField = tasks.length > 0 && tasks.every((task) => hasReviewField(task))
  const reviewMode = hasAnyReviewField
    ? allHaveReviewField
      ? 'reviewed'
      : 'mixed'
    : 'legacy'

  const completed = tasks.filter((task) => isTaskDone(task, reviewMode)).length
  const pending = tasks.filter((task) => task.status === 'pending').length
  const dispatched = tasks.filter((task) => task.status === 'dispatched').length
  const failed = tasks.filter((task) => task.status === 'failed').length
  const approvedReviews = tasks.filter((task) => task.review_status === 'approved').length

  const doneIds = new Set(tasks.filter((task) => isTaskDone(task, reviewMode)).map((task) => task.id))

  const blockers: Blocker[] = tasks
    .filter((task) => task.status === 'pending')
    .map((task) => {
      const unresolvedDeps = normalizeBlockedBy(task).filter((dep) => !doneIds.has(dep))
      return {
        task: task.id,
        waitingOn: unresolvedDeps,
      }
    })
    .filter((item) => item.waitingOn.length > 0)

  const queue = tasks
    .filter((task) => task.status === 'pending')
    .filter((task) => normalizeBlockedBy(task).every((dep) => doneIds.has(dep)))
    .map((task) => task.id)

  const allDone = tasks.length > 0 && tasks.every((task) => isTaskDone(task, reviewMode))

  const invalidTaskStatuses = tasks
    .filter((task) => !task.status || !TASK_STATUSES.has(task.status as never))
    .map((task) => ({ task: task.id, status: task.status ?? 'undefined' }))

  const invalidRunStatus =
    state.status && !RUN_STATUSES.has(state.status as never) ? state.status : null

  const stateConsistency: string[] = []
  if (state.status === 'completed' && !allDone) {
    stateConsistency.push('run status is completed but not all tasks are done')
  }

  if (
    state.status === 'planning' &&
    tasks.some((task) =>
      ['dispatched', 'agent_done', 'reviewing', 'completed', 'failed'].includes(
        task.status ?? '',
      ),
    )
  ) {
    stateConsistency.push('run status is planning but task statuses indicate execution has started')
  }

  const ok =
    missingDepRefs.length === 0 &&
    dependencyCycles.length === 0 &&
    invalidTaskStatuses.length === 0 &&
    invalidRunStatus === null &&
    stateConsistency.length === 0

  print({
    ok,
    activeRun: runId,
    runStatus: state.status ?? 'unknown',
    reviewMode,
    counters: {
      total: tasks.length,
      completed,
      pending,
      dispatched,
      failed,
      approvedReviews,
    },
    queue,
    blockers,
    allDone,
    issues: {
      missingDepRefs,
      dependencyCycles,
      invalidTaskStatuses,
      invalidRunStatus,
      stateConsistency,
    },
  })

  if (!ok) {
    process.exitCode = 1
  }
}

void main()
