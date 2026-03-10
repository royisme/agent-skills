#!/usr/bin/env bun
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(process.cwd())
const CLAUDE_DIR = resolve(REPO_ROOT, '.claude')
const SELFWORK_DIR = resolve(CLAUDE_DIR, 'selfwork')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')
const ARCHIVE_DIR = resolve(SELFWORK_DIR, 'archive')
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
    try { await unlink(tmp) } catch {}
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

async function createNewRun() {
  const runId = makeRunId()
  const runDir = resolve(RUNS_DIR, runId)

  await ensureDir(resolve(runDir, 'specs'))
  await ensureDir(resolve(runDir, 'done'))
  await ensureDir(resolve(runDir, 'reviews'))

  const state = {
    run_id: runId,
    branch: getCurrentBranch(),
    status: 'planning',
    requirement: '',
    tasks: [],
  }

  await writeFileAtomically(resolve(runDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`)
  await writeFileAtomically(ACTIVE_FILE, `${runId}\n`)

  return { created: true, run_id: runId, run_dir: runDir }
}

async function main() {
  await ensureDir(SELFWORK_DIR)
  await ensureDir(RUNS_DIR)
  await ensureDir(ARCHIVE_DIR)

  let activeRunId: string | null = null

  if (existsSync(ACTIVE_FILE)) {
    try {
      const value = (await readFile(ACTIVE_FILE, 'utf8')).trim()
      if (value && isValidRunId(value)) {
        activeRunId = value
      }
    } catch {
      activeRunId = null
    }
  }

  let bootstrapResult: Record<string, unknown> = { created: false }

  if (!activeRunId) {
    bootstrapResult = await createNewRun()
    activeRunId = bootstrapResult.run_id as string
  }

  const statePath = resolve(RUNS_DIR, activeRunId, 'state.json')

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      repo_root: REPO_ROOT,
      selfwork_dir: SELFWORK_DIR,
      active_run: activeRunId,
      state_file: statePath,
      bootstrap: bootstrapResult,
    }, null, 2)}\n`,
  )
}

void main()
