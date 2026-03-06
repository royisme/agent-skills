#!/usr/bin/env bun
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

type DispatchInstruction = {
  action: 'none' | 'dispatch_subagent' | 'await_human_gate' | 'blocked'
  phase: string
  run_id: string | null
  task_ids?: string[]
  subagent_type?: string
  mode?: 'serial' | 'parallel'
  notes?: string[]
}

type DispatchJob = {
  task_id: string
  title: string | null
  subagent_type: string
  spec_path: string | null
  expected_artifacts: string[]
  complexity: string | null
  task_type: string | null
  criticality: string | null
  test_command: string | null
}

type ExecuteNextOutput = {
  ok: boolean
  ready?: boolean
  reason?: string
  instruction?: DispatchInstruction
  execution_plan?: {
    run_id: string
    mode?: 'serial' | 'parallel'
    state_file: string
    jobs: DispatchJob[]
  }
}

type TaskStatus = 'pending' | 'dispatching' | 'dispatched' | 'agent_done' | 'reviewing' | 'completed' | 'failed'
type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'blocked'

type Task = {
  id: string
  title?: string
  status?: TaskStatus
  agent_type?: string
  agent_id?: string | null
  retry_count?: number
  review_status?: ReviewStatus
  dispatch_count?: number
  last_artifact?: string | null
  last_error?: string | null
  updated_at?: string
}

type RunState = {
  run_id?: string
  status?: string
  blocked_reason?: string | null
  updated_at?: string
  current_instruction?: DispatchInstruction | null
  last_instruction?: DispatchInstruction | null
  tasks?: Task[]
}

const REPO_ROOT = resolve(process.cwd())
const SCRIPT_DIR = dirname(process.argv[1] ?? '')
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? resolve(SCRIPT_DIR, '../../..')
const EXECUTE_NEXT_SCRIPT = resolve(PLUGIN_ROOT, 'skills/selfwork/scripts/execute-next.ts')

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

function decodeStdout(stdout: string | Uint8Array | null | undefined) {
  if (!stdout) {
    return ''
  }
  if (typeof stdout === 'string') {
    return stdout
  }
  return new TextDecoder().decode(stdout)
}

function buildAgentId(job: DispatchJob) {
  return `selfwork-${job.subagent_type}-${job.task_id}-${Date.now()}`
}

async function updateStateForDispatch(statePath: string, instruction: DispatchInstruction, jobs: DispatchJob[]) {
  const state = await readJson<RunState>(statePath)
  if (!state) {
    throw new Error('state.json is missing or invalid')
  }

  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const touched: Array<{ task_id: string; agent_id: string; subagent_type: string; status: string }> = []

  if (instruction.phase === 'designing' || instruction.phase === 'specifying') {
    const phaseJob = jobs[0]
    const agentId = phaseJob ? buildAgentId(phaseJob) : `selfwork-${instruction.phase}-${Date.now()}`

    state.last_instruction = state.current_instruction ?? null
    state.current_instruction = {
      ...instruction,
      notes: [...(instruction.notes ?? []), `Reserved ${instruction.phase} dispatch as ${agentId}.`],
    }
    state.blocked_reason = null
    state.updated_at = now()
    await writeJsonAtomically(statePath, state)

    touched.push({
      task_id: instruction.phase,
      agent_id: agentId,
      subagent_type: phaseJob?.subagent_type ?? instruction.subagent_type ?? 'unknown',
      status: 'reserved',
    })
    return touched
  }

  for (const job of jobs) {
    const task = taskMap.get(job.task_id)
    if (!task) {
      continue
    }

    const agentId = buildAgentId(job)
    task.agent_id = agentId
    task.agent_type = job.subagent_type
    task.dispatch_count = (task.dispatch_count ?? 0) + 1
    task.updated_at = now()
    task.last_error = null

    if (instruction.phase === 'review') {
      task.status = 'reviewing'
    } else {
      task.status = 'dispatched'
      if (instruction.phase === 'retry') {
        task.retry_count = (task.retry_count ?? 0) + 1
        task.review_status = 'pending'
      }
    }

    touched.push({
      task_id: job.task_id,
      agent_id: agentId,
      subagent_type: job.subagent_type,
      status: task.status ?? 'dispatched',
    })
  }

  state.last_instruction = state.current_instruction ?? null
  state.current_instruction = instruction
  state.blocked_reason = null
  state.updated_at = now()

  await writeJsonAtomically(statePath, state)
  return touched
}

async function main() {
  if (!existsSync(ACTIVE_FILE)) {
    process.stdout.write(`${JSON.stringify({ ok: true, dispatched: false, reason: 'No active run.' }, null, 2)}\n`)
    return
  }

  const proc = Bun.spawnSync(['bun', EXECUTE_NEXT_SCRIPT], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  })

  if (!proc.success) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: 'execute-next.ts failed', stderr: decodeStdout(proc.stderr).trim() }, null, 2)}\n`,
    )
    process.exitCode = 1
    return
  }

  const result = JSON.parse(decodeStdout(proc.stdout)) as ExecuteNextOutput
  if (!result.ok || !result.ready || !result.execution_plan || !result.instruction) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          dispatched: false,
          reason: result.reason ?? 'No dispatchable action.',
          instruction: result.instruction ?? null,
        },
        null,
        2,
      )}\n`,
    )
    return
  }

  const stateFile = result.execution_plan.state_file
  const touched = await updateStateForDispatch(stateFile, result.instruction, result.execution_plan.jobs)

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        dispatched: touched.length > 0,
        run_id: result.execution_plan.run_id,
        phase: result.instruction.phase,
        mode: result.execution_plan.mode ?? 'serial',
        jobs: touched,
        note: 'State updated for dispatch. Actual subagent launch must be performed by the orchestrator using this execution result.',
      },
      null,
      2,
    )}\n`,
  )
}

void main()
