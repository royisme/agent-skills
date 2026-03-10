#!/usr/bin/env bun
import { open, readFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

type Task = {
  id: string
  status?: 'pending' | 'running' | 'reviewing' | 'done' | 'failed'
  deps?: string[]
  retries?: number
  max_retries?: number
}

type RunState = {
  run_id?: string
  status?: 'planning' | 'executing' | 'completed' | 'blocked'
  tasks?: Task[]
}

const REPO_ROOT = resolve(process.cwd())
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const ACTIVE_LOCK_FILE = resolve(SELFWORK_DIR, 'active.lock')
const LOCK_RETRY_ATTEMPTS = 4
const LOCK_RETRY_DELAY_MS = 25
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/

function isValidRunId(id: string) {
  return id.length > 0 && id.length <= 128 && RUN_ID_PATTERN.test(id) && !id.includes('..')
}

function output(obj: { decision: string; reason: string; instruction?: unknown }) {
  console.log(JSON.stringify(obj))
}

async function withActiveLock<T>(fn: () => Promise<T>): Promise<T | null> {
  let lockHandle: Awaited<ReturnType<typeof open>> | null = null

  for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      lockHandle = await open(ACTIVE_LOCK_FILE, 'wx')
      break
    } catch {
      if (attempt === LOCK_RETRY_ATTEMPTS - 1) return null
      await Bun.sleep(LOCK_RETRY_DELAY_MS)
    }
  }

  if (!lockHandle) return null

  try {
    return await fn()
  } finally {
    try { await lockHandle.close() } catch {}
    try { await unlink(ACTIVE_LOCK_FILE) } catch {}
  }
}

async function clearActiveRun(): Promise<void> {
  await withActiveLock(async () => {
    const handle = await open(ACTIVE_FILE, 'r+')
    try { await handle.truncate(0) } finally { await handle.close() }
  })
}

async function main() {
  const raw = await Bun.stdin.text()
  let input: { stop_hook_active: boolean }
  try { input = JSON.parse(raw) } catch { process.exit(0) }

  if (input.stop_hook_active) process.exit(0)
  if (!existsSync(ACTIVE_FILE)) process.exit(0)

  let runId = ''
  try { runId = (await readFile(ACTIVE_FILE, 'utf8')).trim() } catch { process.exit(0) }
  if (!runId || !isValidRunId(runId)) process.exit(0)

  const stateFilePath = resolve(RUNS_DIR, runId, 'state.json')
  if (!existsSync(stateFilePath)) process.exit(0)

  let state: RunState
  try { state = JSON.parse(await readFile(stateFilePath, 'utf8')) } catch { process.exit(0) }

  // Minimal schema validation
  if (!state.run_id || !state.status || !Array.isArray(state.tasks)) {
    output({ decision: 'block', reason: '[selfwork] state.json missing required fields (run_id, status, tasks)' })
    return
  }

  // Completed → clear active pointer and allow stop
  if (state.status === 'completed') {
    await clearActiveRun()
    process.exit(0)
  }

  // Planning, blocked → allow stop. The CEO handles human gates and final reporting.
  if (state.status !== 'executing') {
    process.exit(0)
  }

  // Executing: check whether there is still work in flight or ready to dispatch
  const tasks = state.tasks
  const doneIds = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id))

  const hasRunnable = tasks.some(
    (t) => t.status === 'pending' && (t.deps ?? []).every((d) => doneIds.has(d)),
  )
  const hasInProgress = tasks.some(
    (t) => t.status === 'running' || t.status === 'reviewing',
  )

  if (!hasRunnable && !hasInProgress) {
    // All tasks settled (done or failed) — let the CEO check and produce the report
    process.exit(0)
  }

  // Work remains — prevent the CEO from stopping prematurely
  output({
    decision: 'approve',
    reason: `[selfwork] Auto-continue execute loop: ${hasRunnable ? 'tasks ready to dispatch' : 'agents still in progress'}`,
    instruction: { action: 'dispatch_subagent', phase: 'executing', run_id: runId },
  })
}

main().catch((error) => {
  output({
    decision: 'block',
    reason: `[selfwork] hook failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  })
})
