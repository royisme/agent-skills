#!/usr/bin/env bun
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

type RunStatus = 'planning' | 'intent_recognition' | 'info_collecting' | 'analyzing' | 'designing' | 'specifying' | 'executing' | 'completed' | 'blocked'
type TaskStatus = 'pending' | 'dispatching' | 'dispatched' | 'agent_done' | 'reviewing' | 'completed' | 'failed'
type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'blocked'

type Task = {
  id: string
  title?: string
  description?: string
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
  target_files?: string[]
  dispatch_count?: number
  last_artifact?: string | null
  last_error?: string | null
  updated_at?: string
  spec_source?: string
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

type ClarificationQuestion = {
  question: string
  reason: string
  answered?: boolean
  answer?: string
}

type RequirementAnalysis = {
  run_id?: string
  original_request?: string
  summary?: string
  clarity?: 'clear' | 'partial' | 'unclear'
  clarification_questions?: ClarificationQuestion[]
  user_stories?: unknown[]
}

type ProductSpec = {
  spec_path?: string
}

type PlanTask = {
  id: string
  title?: string
  description?: string
  dependencies?: string[]
  blocked_by?: string[]
  complexity?: 'small' | 'medium' | 'hard'
  agent_type?: string
  task_type?: 'tdd' | 'non_tdd'
  criticality?: 'critical' | 'normal'
  test_command?: string
  target_files?: string[]
  spec_source?: string
}

type Plan = {
  run_id?: string
  spec_path?: string
  tasks?: PlanTask[]
}

const REPO_ROOT = resolve(process.cwd())
const SELFWORK_DIR = resolve(REPO_ROOT, '.claude/selfwork')
const ACTIVE_FILE = resolve(SELFWORK_DIR, 'active')
const RUNS_DIR = resolve(SELFWORK_DIR, 'runs')
const TASK_SPECS_DIR = resolve(SELFWORK_DIR, 'task-specs')
const DEFAULT_MAX_RETRIES = 2

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

function taskSpecsSubtasksDir(runId: string) {
  return resolve(TASK_SPECS_DIR, runId, 'subtasks')
}

function taskSpecPath(runId: string, taskId: string) {
  return resolve(taskSpecsSubtasksDir(runId), `${taskId}.md`)
}

function resolveSpecPath(state: RunState) {
  if (!state.spec_path) {
    return null
  }
  return resolve(REPO_ROOT, state.spec_path)
}

function firstIssueDescription(report: ReviewReport | null): string | null {
  const first = report?.issues?.find(
    (issue) => typeof issue.description === 'string' && issue.description.trim().length > 0,
  )
  return first?.description?.trim() ?? null
}

function canConsumeReviewReport(status?: TaskStatus): boolean {
  return status === 'dispatched' || status === 'reviewing' || status === 'agent_done' || status === 'completed'
}

function applyReviewVerdict(task: Task, reviewReport: ReviewReport, transitions: string[]): void {
  const verdict = reviewReport.verdict

  if (verdict === 'approved') {
    task.status = 'completed'
    task.review_status = 'approved'
    task.last_error = null
    transitions.push(`task ${task.id}: review -> completed`)
    return
  }

  if (verdict === 'changes_requested') {
    task.status = 'failed'
    task.review_status = 'changes_requested'
    task.last_error = firstIssueDescription(reviewReport) ?? 'Review requested changes'
    transitions.push(`task ${task.id}: review -> failed(changes_requested)`)
    return
  }

  if (verdict === 'blocked') {
    task.status = 'failed'
    task.review_status = 'blocked'
    task.last_error = firstIssueDescription(reviewReport) ?? 'Review blocked task'
    transitions.push(`task ${task.id}: review -> failed(blocked)`)
  }
}

function normalizeBlockedBy(task: PlanTask) {
  if (Array.isArray(task.blocked_by)) {
    return task.blocked_by
  }
  if (Array.isArray(task.dependencies)) {
    return task.dependencies
  }
  return []
}

function normalizePlanTask(task: PlanTask, existing: Task | undefined, specSource: string | null): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: existing?.status ?? 'pending',
    blocked_by: normalizeBlockedBy(task),
    review_status: existing?.review_status ?? 'pending',
    retry_count: existing?.retry_count ?? 0,
    complexity: task.complexity,
    agent_type: task.agent_type,
    agent_id: existing?.agent_id ?? null,
    task_type: task.task_type,
    criticality: task.criticality,
    test_command: task.test_command,
    target_files: Array.isArray(task.target_files) ? task.target_files : existing?.target_files,
    dispatch_count: existing?.dispatch_count ?? 0,
    last_artifact: existing?.last_artifact ?? null,
    last_error: existing?.last_error ?? null,
    updated_at: existing?.updated_at ?? now(),
    spec_source: task.spec_source ?? specSource ?? existing?.spec_source,
  }
}

function buildTaskSpecMarkdown(runId: string, task: Task) {
  const header = {
    task_id: task.id,
    task_type: task.task_type ?? null,
    criticality: task.criticality ?? null,
    test_command: task.test_command ?? null,
    spec_source: task.spec_source ?? null,
    output_artifact: `.claude/selfwork/runs/${runId}/artifacts/dev-report-${task.id}.json`,
    run_id: runId,
    title: task.title ?? null,
    description: task.description ?? null,
    dependencies: task.blocked_by ?? [],
    complexity: task.complexity ?? null,
    agent_type: task.agent_type ?? null,
    target_files: task.target_files ?? [],
  }

  const goal = task.description?.trim() || task.title?.trim() || `Complete task ${task.id}.`
  const targetFiles = (task.target_files ?? []).length > 0 ? (task.target_files ?? []).map((file) => `- \`${file}\``).join('\n') : '- None specified'
  const dependencies = (task.blocked_by ?? []).length > 0 ? (task.blocked_by ?? []).map((dep) => `- ${dep}`).join('\n') : '- None'
  const implementationNotes = [
    task.description?.trim() ? `- Implement: ${task.description.trim()}` : `- Implement the scoped changes for ${task.id}.`,
    task.spec_source ? `- Follow spec source: \`${task.spec_source}\`` : '- Follow the approved selfwork spec and plan.',
    task.agent_type ? `- Intended agent type: \`${task.agent_type}\`` : '- Use the assigned developer agent for this task.',
  ].join('\n')
  const acceptanceCriteria = [
    `1. ${task.title?.trim() ? `${task.title.trim()} is implemented.` : `Task ${task.id} is implemented.`}`,
    task.test_command ? `2. \`${task.test_command}\` passes.` : '2. Relevant validation for the task is completed.',
    '3. Scope remains limited to this task specification.',
  ].join('\n')

  return [`\`\`\`json`, JSON.stringify(header, null, 2), '\`\`\`', '', `# ${task.id}: ${task.title ?? task.id}`, '', '## Goal', goal, '', '## Target Files', targetFiles, '', '## Dependencies', dependencies, '', '## Implementation Notes', implementationNotes, '', '## Acceptance Criteria', acceptanceCriteria, ''].join('\n')
}

async function materializeTaskSpecs(tasks: Task[], runId: string, transitions: string[]) {
  const subtasksDir = taskSpecsSubtasksDir(runId)
  await mkdir(subtasksDir, { recursive: true })

  for (const task of tasks) {
    await writeFile(taskSpecPath(runId, task.id), `${buildTaskSpecMarkdown(runId, task)}\n`)
  }

  if (tasks.length > 0) {
    transitions.push(`task specs materialized (${tasks.length} files)`)
  }
}

function findMissingTaskSpecs(tasks: Task[], runId: string) {
  return tasks.filter((task) => !existsSync(taskSpecPath(runId, task.id))).map((task) => `${task.id} (${taskSpecPath(runId, task.id)})`)
}

async function syncTasksFromPlan(state: RunState, runId: string, transitions: string[]) {
  const planPath = artifactPath(runId, 'plan.json')
  if (!existsSync(planPath)) {
    return { synced: false, missingCriticalTddCommands: [] as string[], missingTaskSpecs: [] as string[] }
  }

  const plan = await readJson<Plan>(planPath)
  const planTasks = Array.isArray(plan?.tasks) ? plan.tasks : []
  const currentTasks = Array.isArray(state.tasks) ? state.tasks : []
  const currentById = new Map(currentTasks.map((task) => [task.id, task]))
  const specSource = plan?.spec_path ?? state.spec_path ?? null

  const syncedTasks = planTasks.map((task) => normalizePlanTask(task, currentById.get(task.id), specSource))
  const before = JSON.stringify(currentTasks)
  const after = JSON.stringify(syncedTasks)

  state.tasks = syncedTasks

  if (before !== after) {
    transitions.push(`tasks synced from plan.json (${syncedTasks.length} tasks)`)
  }

  await materializeTaskSpecs(syncedTasks, runId, transitions)

  const missingCriticalTddCommands = syncedTasks
    .filter((task) => task.task_type === 'tdd' && task.criticality === 'critical' && !task.test_command)
    .map((task) => task.id)

  const missingTaskSpecs = findMissingTaskSpecs(syncedTasks, runId)

  return { synced: true, missingCriticalTddCommands, missingTaskSpecs }
}

async function reconcilePhase(state: RunState, runId: string, transitions: string[]) {
  const current = state.status ?? 'planning'

  // Cache existence checks to avoid redundant I/O
  const hasInfoCollection = existsSync(artifactPath(runId, 'info-collection.json'))
  const hasRequirementAnalysis = existsSync(artifactPath(runId, 'requirement-analysis.json'))
  const hasProductSpec = existsSync(artifactPath(runId, 'product-spec.json'))

  // Phase: planning → intent_recognition (auto)
  if (current === 'planning') {
    state.status = 'intent_recognition'
    transitions.push('status planning -> intent_recognition')
  }

  // Phase: intent_recognition → info_collecting (dispatch info-collector if no info yet)
  if (current === 'intent_recognition' && !hasInfoCollection) {
    state.status = 'info_collecting'
    transitions.push('status intent_recognition -> info_collecting')
  }

  // Phase: intent_recognition → analyzing (if info already collected)
  if (current === 'intent_recognition' && hasInfoCollection) {
    if (!hasRequirementAnalysis) {
      state.status = 'analyzing'
      transitions.push('status intent_recognition -> analyzing (info available)')
    }
  }

  // Phase: info_collecting → analyzing (if info collection was dispatched)
  if (current === 'info_collecting' && hasInfoCollection) {
    state.status = 'analyzing'
    transitions.push('status info_collecting -> analyzing')
  }

  // Phase: analyzing → designing
  // But first check if there are clarification questions that need user input
  if (state.status === 'analyzing' && hasRequirementAnalysis) {
    const reqAnalysis = await readJson<RequirementAnalysis>(artifactPath(runId, 'requirement-analysis.json'))

    // If there are clarification questions and they haven't been answered, wait for user
    const hasUnansweredClarifications =
      reqAnalysis?.clarification_questions?.some((q: ClarificationQuestion) => !(q as ClarificationQuestion & { answered?: boolean }).answered) ?? false

    if (!hasUnansweredClarifications) {
      // Move to designing only after clarifications are resolved
      state.status = 'designing'
      transitions.push('status analyzing -> designing')
    } else {
      // Keep in analyzing, clarification needed
      state.blocked_reason = 'Clarification questions pending user response'
      transitions.push('status analyzing -> analyzing (clarification needed)')
    }
  }

  // Phase: designing → specifying (when design approved)
  if (state.status === 'designing' && hasProductSpec) {
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
    const hasApprovedSpecInputs =
      existsSync(artifactPath(runId, 'plan.json')) &&
      Boolean(resolvedSpecPath && existsSync(resolvedSpecPath)) &&
      state.spec_status === 'approved'

    const { missingCriticalTddCommands, missingTaskSpecs } = await syncTasksFromPlan(state, runId, transitions)

    if (hasApprovedSpecInputs) {
      if (missingCriticalTddCommands.length > 0) {
        state.status = 'blocked'
        state.blocked_reason = `Critical TDD tasks missing test_command before execution: ${missingCriticalTddCommands.join(', ')}`
        transitions.push('status specifying -> blocked (missing critical tdd test_command)')
        return
      }

      if (missingTaskSpecs.length > 0) {
        state.blocked_reason = `Missing task-spec files required before execution: ${missingTaskSpecs.join(', ')}`
        transitions.push('specifying gated by missing task-spec files')
        return
      }

      state.status = 'executing'
      state.blocked_reason = null
      transitions.push('status specifying -> executing')
    }
  }
}

async function reconcileTasks(state: RunState, runId: string, transitions: string[]) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const maxRetries = typeof state.max_retries === 'number' ? state.max_retries : DEFAULT_MAX_RETRIES
  let hasFailed = false
  let hasRetryableFailed = false
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

    if (canConsumeReviewReport(task.status) && existsSync(reviewReportPath)) {
      const reviewReport = await readJson<ReviewReport>(reviewReportPath)
      task.last_artifact = reviewReportPath
      task.updated_at = now()

      if (reviewReport) {
        applyReviewVerdict(task, reviewReport, transitions)
      }
    }

    if (task.status === 'failed') {
      hasFailed = true
      if ((task.retry_count ?? 0) < maxRetries) {
        hasRetryableFailed = true
      }
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

  if (!hasInFlight && hasFailed && !hasRetryableFailed) {
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
        blocked_reason: state.blocked_reason ?? null,
      },
      null,
      2,
    )}\n`,
  )
}

void main()
