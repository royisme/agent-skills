#!/usr/bin/env bun
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

type StopHookInput = {
  stop_hook_active: boolean
}

type DispatchInstruction = {
  action: 'none' | 'dispatch_subagent' | 'await_human_gate' | 'blocked'
  phase: string
  run_id: string | null
  task_ids?: string[]
  subagent_type?: string
  mode?: 'serial' | 'parallel'
  notes?: string[]
}

type DispatchNextOutput = {
  ok: boolean
  instruction?: DispatchInstruction
}

type DispatchState = {
  run_id?: string
  plan?: string
  branch?: string
  status?: 'planning' | 'intent_recognition' | 'info_collecting' | 'analyzing' | 'designing' | 'specifying' | 'executing' | 'completed' | 'blocked'
  spec_status?: 'draft' | 'approved' | 'obsolete'
  blocked_reason?: string | null
  updated_at?: string
  max_retries?: number
  tasks?: Array<{
    id: string
    status?: 'pending' | 'dispatching' | 'dispatched' | 'agent_done' | 'reviewing' | 'completed' | 'failed'
    task_type?: 'tdd' | 'non_tdd'
    criticality?: 'critical' | 'normal'
    test_command?: string
  }>
}

const REPO_ROOT = resolve(process.cwd())
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? resolve(REPO_ROOT, '.claude-plugin')
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const ACTIVE_LOCK_FILE = resolve(SELFWORK_DIR, 'active.lock')
const DISPATCH_NEXT_SCRIPT = resolve(PLUGIN_ROOT, 'skills/selfwork/scripts/dispatch-next.ts')
const RECONCILE_SCRIPT = resolve(PLUGIN_ROOT, 'skills/selfwork/scripts/reconcile-state.ts')
const LOCK_RETRY_ATTEMPTS = 4
const LOCK_RETRY_DELAY_MS = 25
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const VALID_STATUSES = ['planning', 'intent_recognition', 'info_collecting', 'analyzing', 'designing', 'specifying', 'executing', 'completed', 'blocked']

function output(obj: { decision: string; reason: string; instruction?: unknown }) {
  console.log(JSON.stringify(obj))
}

function isValidRunId(runId: string) {
  return runId.length > 0 && runId.length <= 128 && RUN_ID_PATTERN.test(runId) && !runId.includes('..')
}

function validateStateSchema(state: DispatchState): { ok: boolean; reason?: string } {
  if (!state.run_id || typeof state.run_id !== 'string') {
    return { ok: false, reason: 'State missing required field: run_id' }
  }
  if (!state.plan || typeof state.plan !== 'string') {
    return { ok: false, reason: 'State missing required field: plan' }
  }
  if (!state.branch || typeof state.branch !== 'string') {
    return { ok: false, reason: 'State missing required field: branch' }
  }
  if (!state.status || !VALID_STATUSES.includes(state.status)) {
    return { ok: false, reason: `State missing required field: status (must be one of ${VALID_STATUSES.join('|')})` }
  }
  if (!Array.isArray(state.tasks)) {
    return { ok: false, reason: 'State missing required field: tasks (must be an array)' }
  }
  return { ok: true }
}

function checkArtifacts(runDir: string, state: DispatchState): { ok: boolean; reason?: string } {
  const status = state.status ?? 'planning'

  if (status === 'info_collecting' && !existsSync(resolve(runDir, 'artifacts/info-collection.json'))) {
    return { ok: false, reason: 'Info Collector has not produced info-collection.json yet' }
  }
  if (status === 'analyzing' && !existsSync(resolve(runDir, 'artifacts/requirement-analysis.json'))) {
    return { ok: false, reason: 'Requirement Analyst has not produced requirement-analysis.json yet' }
  }
  if (status === 'designing' && !existsSync(resolve(runDir, 'artifacts/product-spec.json'))) {
    return { ok: false, reason: 'Product Designer has not produced product-spec.json yet' }
  }
  if (status === 'specifying') {
    if (!existsSync(resolve(runDir, 'artifacts/plan.json'))) {
      return { ok: false, reason: 'Architect has not produced plan.json yet' }
    }
    if (!state.spec_status) {
      return { ok: false, reason: 'spec_status must be set during specifying phase' }
    }
  }
  if (status === 'executing' && state.spec_status !== 'approved') {
    return { ok: false, reason: 'spec_status must be approved before executing' }
  }

  return { ok: true }
}

function checkTDDGate(tasks: DispatchState['tasks']): { ok: boolean; reason?: string } {
  for (const task of tasks ?? []) {
    if (task.status === 'pending' && task.task_type === 'tdd' && task.criticality === 'critical' && !task.test_command) {
      return { ok: false, reason: `Critical TDD task ${task.id} missing test_command` }
    }
  }
  return { ok: true }
}

function decodeStdout(stdout: string | Uint8Array | null | undefined) {
  if (!stdout) {
    return ''
  }
  if (typeof stdout === 'string') {
    return stdout
  }
  return new TextDecoder().decode(stdout)
}

async function withActiveLock<T>(fn: () => Promise<T>): Promise<T | null> {
  let lockHandle: Awaited<ReturnType<typeof open>> | null = null

  for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      lockHandle = await open(ACTIVE_LOCK_FILE, 'wx')
      break
    } catch {
      if (attempt === LOCK_RETRY_ATTEMPTS - 1) {
        return null
      }
      await Bun.sleep(LOCK_RETRY_DELAY_MS)
    }
  }

  if (!lockHandle) {
    return null
  }

  try {
    return await fn()
  } finally {
    try {
      await lockHandle.close()
    } catch {}
    try {
      await unlink(ACTIVE_LOCK_FILE)
    } catch {}
  }
}

async function clearActiveIfMatchingRun(runId: string): Promise<void> {
  if (!isValidRunId(runId)) {
    return
  }

  await withActiveLock(async () => {
    let activeRunId = ''
    try {
      activeRunId = (await readFile(ACTIVE_FILE, 'utf8')).trim()
    } catch {
      return
    }

    if (activeRunId !== runId) {
      return
    }

    const activeHandle = await open(ACTIVE_FILE, 'r+')
    try {
      await activeHandle.truncate(0)
    } finally {
      await activeHandle.close()
    }
  })
}

async function writeStateAtomically(stateFilePath: string, state: DispatchState): Promise<void> {
  const tmpPath = `${stateFilePath}.${process.pid}.${Date.now()}.tmp`
  await Bun.write(tmpPath, `${JSON.stringify(state, null, 2)}\n`)
  try {
    await rename(tmpPath, stateFilePath)
  } catch (error) {
    try {
      await unlink(tmpPath)
    } catch {}
    throw error
  }
}

function runScript(scriptPath: string) {
  return Bun.spawnSync(['bun', scriptPath], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  })
}

async function main() {
  const raw = await Bun.stdin.text()
  let input: StopHookInput
  try {
    input = JSON.parse(raw)
  } catch {
    process.exit(0)
    return
  }

  if (input.stop_hook_active) {
    process.exit(0)
    return
  }

  if (!existsSync(ACTIVE_FILE)) {
    process.exit(0)
    return
  }

  const reconcileProc = runScript(RECONCILE_SCRIPT)
  if (!reconcileProc.success) {
    output({ decision: 'block', reason: `[selfwork] reconcile-state.ts failed: ${decodeStdout(reconcileProc.stderr).trim()}` })
    return
  }

  const runId = (await readFile(ACTIVE_FILE, 'utf8')).trim()
  if (!isValidRunId(runId)) {
    output({ decision: 'block', reason: `[selfwork] Active run id is invalid: ${runId}` })
    return
  }

  const stateFilePath = resolve(RUNS_DIR, runId, 'state.json')
  if (!existsSync(stateFilePath)) {
    output({ decision: 'block', reason: `[selfwork] state.json is missing for active run: ${runId}` })
    return
  }

  const state = JSON.parse(await readFile(stateFilePath, 'utf8')) as DispatchState
  const schemaValidation = validateStateSchema(state)
  if (!schemaValidation.ok) {
    output({ decision: 'block', reason: `[selfwork] State validation failed: ${schemaValidation.reason}` })
    return
  }

  const runDir = resolve(RUNS_DIR, runId)
  const artifactCheck = checkArtifacts(runDir, state)
  if (!artifactCheck.ok) {
    output({ decision: 'block', reason: `[selfwork] ${artifactCheck.reason}` })
    return
  }

  const tddGate = checkTDDGate(state.tasks)
  if (!tddGate.ok) {
    output({ decision: 'block', reason: `[selfwork] TDD gate: ${tddGate.reason}` })
    return
  }

  if (state.status === 'completed') {
    await clearActiveIfMatchingRun(runId)
    process.exit(0)
    return
  }

  if (state.status === 'blocked') {
    output({ decision: 'block', reason: `[selfwork] BLOCKED: ${state.blocked_reason ?? 'Manual intervention required.'}` })
    return
  }

  if (state.status !== 'executing') {
    process.exit(0)
    return
  }

  const dispatchProc = runScript(DISPATCH_NEXT_SCRIPT)
  if (!dispatchProc.success) {
    output({ decision: 'block', reason: `[selfwork] dispatch-next.ts failed: ${decodeStdout(dispatchProc.stderr).trim()}` })
    return
  }

  const next = JSON.parse(decodeStdout(dispatchProc.stdout)) as DispatchNextOutput
  const instruction = next.instruction
  if (!next.ok || !instruction) {
    output({ decision: 'block', reason: '[selfwork] dispatch-next.ts returned invalid output' })
    return
  }

  if (instruction.action === 'dispatch_subagent') {
    output({
      decision: 'block',
      reason: `[selfwork] Dispatch required for phase=${instruction.phase}${instruction.task_ids?.length ? ` tasks=${instruction.task_ids.join(',')}` : ''}`,
      instruction,
    })
    return
  }

  if (instruction.action === 'blocked') {
    state.status = 'blocked'
    state.updated_at = new Date().toISOString()
    await writeStateAtomically(stateFilePath, state)
    output({ decision: 'block', reason: `[selfwork] BLOCKED: ${instruction.notes?.join(' ') ?? 'Manual intervention required.'}`, instruction })
    return
  }

  process.exit(0)
}

main().catch((error) => {
  output({
    decision: 'block',
    reason: `[selfwork] hook execution failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  })
})
