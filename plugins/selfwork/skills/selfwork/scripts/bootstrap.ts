#!/usr/bin/env bun
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(process.cwd())
const CLAUDE_DIR = resolve(REPO_ROOT, '.claude')
const SELFWORK_DIR = resolve(CLAUDE_DIR, 'selfwork')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')
const TASK_SPECS_DIR = resolve(SELFWORK_DIR, 'task-specs')
const ARCHIVE_DIR = resolve(SELFWORK_DIR, 'archive')
const DOCS_DIR = resolve(SELFWORK_DIR, 'docs')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/

function isValidRunId(runId: string) {
  return runId.length > 0 && runId.length <= 128 && RUN_ID_PATTERN.test(runId) && !runId.includes('..')
}

function makeRunId() {
  const timestamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, '')
  const random = Math.random().toString(36).slice(2, 8)
  return `run-${timestamp}-${random}`
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true })
}

async function writeFileAtomically(path: string, content: string) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, content)
  try {
    await rename(tmp, path)
  } catch (error) {
    try {
      await unlink(tmp)
    } catch {}
    throw error
  }
}

function getCurrentBranch() {
  try {
    const proc = Bun.spawnSync(['git', 'branch', '--show-current'], {
      cwd: REPO_ROOT,
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const branch = proc.success ? Buffer.from(proc.stdout).toString('utf8').trim() : ''
    return branch || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function ensureNewRun() {
  const runId = makeRunId()
  const runDir = resolve(RUNS_DIR, runId)
  const artifactsDir = resolve(runDir, 'artifacts')
  const taskSpecRunDir = resolve(TASK_SPECS_DIR, runId, 'subtasks')
  const branch = getCurrentBranch()

  await ensureDir(runDir)
  await ensureDir(artifactsDir)
  await ensureDir(taskSpecRunDir)

  const state = {
    run_id: runId,
    plan: 'bootstrap-pending',
    branch,
    status: 'planning',
    design_status: 'draft',
    spec_status: 'draft',
    input_source: 'interactive',
    input_refs: [],
    max_retries: 2,
    tasks: [],
  }

  await writeFileAtomically(resolve(runDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`)
  await writeFileAtomically(ACTIVE_FILE, `${runId}\n`)

  return {
    created: true,
    run_id: runId,
    run_dir: runDir,
    task_spec_dir: taskSpecRunDir,
    artifacts_dir: artifactsDir,
    branch,
  }
}

async function main() {
  await ensureDir(CLAUDE_DIR)
  await ensureDir(SELFWORK_DIR)
  await ensureDir(RUNS_DIR)
  await ensureDir(TASK_SPECS_DIR)
  await ensureDir(ARCHIVE_DIR)
  await ensureDir(DOCS_DIR)

  let activeRun: string | null = null

  if (existsSync(ACTIVE_FILE)) {
    try {
      const value = (await readFile(ACTIVE_FILE, 'utf8')).trim()
      if (value && isValidRunId(value)) {
        activeRun = value
      }
    } catch {
      activeRun = null
    }
  }

  let bootstrapResult: Record<string, unknown> = {
    created: false,
  }

  if (!activeRun) {
    bootstrapResult = await ensureNewRun()
    activeRun = bootstrapResult.run_id as string
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        repo_root: REPO_ROOT,
        claude_dir: CLAUDE_DIR,
        selfwork_dir: SELFWORK_DIR,
        docs_dir: DOCS_DIR,
        active_run: activeRun,
        initialized: true,
        bootstrap: bootstrapResult,
      },
      null,
      2,
    )}\n`,
  )
}

void main()
