#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(process.cwd())
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/

type TaskStatus = 'pending' | 'running' | 'reviewing' | 'done' | 'failed'

type Task = {
  id: string
  title?: string
  complexity?: string
  deps?: string[]
  status?: TaskStatus
  retries?: number
  max_retries?: number
  failure_notes?: string
}

type RunState = {
  run_id?: string
  status?: string
  requirement?: string
  tasks?: Task[]
}

function isValidRunId(id: string) {
  return id.length > 0 && id.length <= 128 && RUN_ID_PATTERN.test(id) && !id.includes('..')
}

function print(obj: unknown) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function main() {
  let runId = ''
  try {
    runId = (await readFile(ACTIVE_FILE, 'utf8')).trim()
  } catch {
    print({ ok: true, activeRun: null, message: 'No active run' })
    return
  }

  if (!isValidRunId(runId)) {
    print({ ok: false, error: 'active run id is invalid', runId })
    process.exitCode = 1
    return
  }

  const statePath = resolve(SELFWORK_DIR, 'runs', runId, 'state.json')
  const state = await readJson<RunState>(statePath)
  if (!state) {
    print({ ok: false, error: 'state.json missing or invalid', runId, statePath })
    process.exitCode = 1
    return
  }

  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const taskIds = new Set(tasks.map((t) => t.id))

  const byStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s)
  const done = byStatus('done')
  const doneIds = new Set(done.map((t) => t.id))

  const runnable = tasks.filter(
    (t) => t.status === 'pending' && (t.deps ?? []).every((d) => doneIds.has(d)),
  )

  const waitingOnDeps = tasks
    .filter((t) => t.status === 'pending' && !(t.deps ?? []).every((d) => doneIds.has(d)))
    .map((t) => ({
      task: t.id,
      waitingOn: (t.deps ?? []).filter((d) => !doneIds.has(d)),
    }))

  const missingDeps = tasks.flatMap((t) =>
    (t.deps ?? []).filter((d) => !taskIds.has(d)).map((d) => ({ task: t.id, missingDep: d })),
  )

  print({
    ok: missingDeps.length === 0,
    activeRun: runId,
    runStatus: state.status ?? 'unknown',
    requirement: (state.requirement ?? '').slice(0, 80) || '(not set)',
    counters: {
      total: tasks.length,
      done: done.length,
      running: byStatus('running').length,
      reviewing: byStatus('reviewing').length,
      pending: byStatus('pending').length,
      failed: byStatus('failed').length,
    },
    runnable: runnable.map((t) => t.id),
    waitingOnDeps,
    issues: { missingDeps },
  })

  if (missingDeps.length > 0) process.exitCode = 1
}

void main()
