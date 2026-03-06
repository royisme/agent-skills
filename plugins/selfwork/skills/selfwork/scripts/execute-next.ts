#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
  instruction: DispatchInstruction
}

type Task = {
  id: string
  title?: string
  complexity?: 'small' | 'medium' | 'hard'
  agent_type?: string
  task_type?: 'tdd' | 'non_tdd'
  criticality?: 'critical' | 'normal'
  test_command?: string
}

type RunState = {
  run_id?: string
  status?: string
  tasks?: Task[]
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

const REPO_ROOT = resolve(process.cwd())
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')
const TASK_SPECS_DIR = resolve(SELFWORK_DIR, 'task-specs')
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? resolve(REPO_ROOT, '.claude-plugin')
const DISPATCH_NEXT_SCRIPT = resolve(PLUGIN_ROOT, 'skills/selfwork/scripts/dispatch-next.ts')

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function print(obj: unknown) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
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

function getTaskAgentType(task: Task) {
  if (task.agent_type) {
    return task.agent_type
  }
  return task.complexity === 'small' ? 'haiku-dev' : 'sonnet-dev'
}

function getExpectedArtifacts(runId: string, instruction: DispatchInstruction, taskId: string) {
  const runArtifactsDir = resolve(RUNS_DIR, runId, 'artifacts')
  if (instruction.phase === 'review') {
    return [resolve(runArtifactsDir, `review-report-${taskId}.json`)]
  }
  if (instruction.phase === 'specifying') {
    return [resolve(runArtifactsDir, 'plan.json')]
  }
  return [resolve(runArtifactsDir, `dev-report-${taskId}.json`)]
}

async function main() {
  if (!existsSync(ACTIVE_FILE)) {
    print({
      ok: true,
      ready: false,
      reason: 'No active run. Bootstrap first.',
    })
    return
  }

  const proc = Bun.spawnSync(['bun', DISPATCH_NEXT_SCRIPT], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  })

  if (!proc.success) {
    print({
      ok: false,
      error: 'dispatch-next.ts failed',
      stderr: decodeStdout(proc.stderr).trim(),
    })
    process.exitCode = 1
    return
  }

  const next = JSON.parse(decodeStdout(proc.stdout)) as DispatchNextOutput
  const instruction = next.instruction

  if (!instruction.run_id) {
    print({
      ok: true,
      ready: false,
      instruction,
    })
    return
  }

  const state = await readJson<RunState>(resolve(RUNS_DIR, instruction.run_id, 'state.json'))
  const tasks = Array.isArray(state?.tasks) ? state!.tasks! : []
  const taskMap = new Map(tasks.map((task) => [task.id, task]))

  if (instruction.action !== 'dispatch_subagent') {
    print({
      ok: true,
      ready: false,
      instruction,
      reason: 'No dispatchable action at this time.',
    })
    return
  }

  const taskIds = instruction.task_ids ?? []
  const jobs: DispatchJob[] = taskIds.map((taskId) => {
    const task = taskMap.get(taskId)
    const subagentType =
      instruction.phase === 'review'
        ? 'code-reviewer'
        : instruction.subagent_type === 'developer-by-complexity'
          ? getTaskAgentType(task ?? { id: taskId })
          : instruction.subagent_type ?? getTaskAgentType(task ?? { id: taskId })

    return {
      task_id: taskId,
      title: task?.title ?? null,
      subagent_type: subagentType,
      spec_path:
        instruction.phase === 'review'
          ? null
          : instruction.phase === 'specifying'
            ? null
            : resolve(TASK_SPECS_DIR, instruction.run_id!, 'subtasks', `${taskId}.md`),
      expected_artifacts: getExpectedArtifacts(instruction.run_id!, instruction, taskId),
      complexity: task?.complexity ?? null,
      task_type: task?.task_type ?? null,
      criticality: task?.criticality ?? null,
      test_command: task?.test_command ?? null,
    }
  })

  print({
    ok: true,
    ready: true,
    instruction,
    execution_plan: {
      repo_root: REPO_ROOT,
      runtime_root: SELFWORK_DIR,
      run_id: instruction.run_id,
      mode: instruction.mode ?? 'serial',
      jobs,
      state_file: resolve(RUNS_DIR, instruction.run_id, 'state.json'),
      next_step: 'Launch the specified subagent(s), then update task status and agent_id in state.json.',
    },
  })
}

void main()
