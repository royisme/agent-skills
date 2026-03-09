#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

type RunStatus =
  | 'planning'
  | 'intent_recognition'
  | 'info_collecting'
  | 'analyzing'
  | 'designing'
  | 'specifying'
  | 'executing'
  | 'completed'
  | 'blocked'

type TaskStatus =
  | 'pending'
  | 'dispatching'
  | 'dispatched'
  | 'agent_done'
  | 'reviewing'
  | 'completed'
  | 'failed'

type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'blocked'
type GateStatus = 'draft' | 'approved' | 'obsolete'
type SpecStatus = GateStatus
type BaselineMode = 'registered_skill' | 'snapshot_prompt' | 'disabled'
type BaselineStatus =
  | 'valid'
  | 'unsupported_in_environment'
  | 'misconfigured'
  | 'not_requested'

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
  spec_source?: string
}

type RunState = {
  run_id?: string
  plan?: string
  branch?: string
  status?: RunStatus
  design_status?: GateStatus
  spec_status?: SpecStatus
  spec_path?: string | null
  input_source?: string
  input_refs?: string[]
  requirement_confidence?: string
  confidence_rationale?: string
  max_retries?: number
  blocked_reason?: string | null
  updated_at?: string
  current_instruction?: unknown
  last_instruction?: unknown
  tasks?: Task[]
}

type ProductSpec = {
  spec_path?: string
}

type PlanTask = {
  id: string
  title?: string
  dependencies?: string[]
  blocked_by?: string[]
  complexity?: 'small' | 'medium' | 'hard'
  agent_type?: string
  task_type?: 'tdd' | 'non_tdd'
  criticality?: 'critical' | 'normal'
  test_command?: string
}

type Plan = {
  run_id?: string
  spec_path?: string
  tasks?: PlanTask[]
}

type ReviewIssue = {
  description?: string
}

type ReviewReport = {
  verdict?: 'approved' | 'changes_requested' | 'blocked'
  issues?: ReviewIssue[]
}

type DevReport = {
  test_result?: 'pass' | 'fail' | 'skipped'
}

type FixtureExpectations = {
  require_active_run?: boolean
  expected_status?: RunStatus
  expected_reconciled_status?: RunStatus
  expected_design_status?: GateStatus
  expected_spec_status?: SpecStatus
  expected_blocked_reason_includes?: string
  require_spec_path?: boolean
  require_spec_path_exists?: boolean
  required_run_artifacts?: string[]
  forbidden_run_artifacts?: string[]
  required_docs?: string[]
  forbidden_docs?: string[]
  required_task_specs?: string[]
  forbidden_task_specs?: string[]
  expected_dispatchable_pending_tasks?: number
  expected_agent_done_tasks?: number
  expected_task_statuses?: Record<string, TaskStatus>
  expected_task_review_statuses?: Record<string, ReviewStatus>
  expected_task_last_error_includes?: Record<string, string>
  expected_next_action?: 'none' | 'dispatch_subagent' | 'await_human_gate' | 'blocked'
  expected_phase?: string
  expected_subagent_type?: string | null
  expected_mode?: 'serial' | 'parallel' | null
  expect_hook_continues_ordinary_execution?: boolean
  baseline?: {
    mode: BaselineMode
    skill_name?: string
    snapshot_path?: string
  }
}

type EvalMetadata = {
  eval_id: number
  eval_name?: string
  prompt?: string
  assertions?: string[]
  fixture_expectations?: FixtureExpectations
}

type ScenarioCheck = {
  name: string
  ok: boolean
  details?: string
  actual?: unknown
  expected?: unknown
}

type DispatchInstruction = {
  action: 'none' | 'dispatch_subagent' | 'await_human_gate' | 'blocked'
  phase:
    | 'bootstrap'
    | 'planning'
    | 'intent_recognition'
    | 'info_collecting'
    | 'analyzing'
    | 'designing'
    | 'specifying'
    | 'dispatch'
    | 'review'
    | 'retry'
    | 'completed'
    | 'blocked'
  run_id: string | null
  subagent_type?: string
  task_ids?: string[]
  mode?: 'serial' | 'parallel'
  notes: string[]
}

type ExecutionJob = {
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

type ValidationOutput = {
  ok: boolean
  eval_id: number | null
  variant: string
  fixture_dir: string
  active_run: string | null
  state_summary: Record<string, unknown>
  scenario_checks: ScenarioCheck[]
  predicted_protocol: Record<string, unknown>
  baseline_status: {
    mode: BaselineMode | null
    status: BaselineStatus
    details: string
  }
  issues: string[]
  warnings: string[]
}

const SCRIPT_DIR = dirname(process.argv[1] ?? resolve(process.cwd(), 'validate-eval-fixture.ts'))
const PLUGIN_ROOT = resolve(SCRIPT_DIR, '../../..')
const SKILLS_ROOT = resolve(PLUGIN_ROOT, 'skills')
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const TASK_STATUSES = new Set<TaskStatus>([
  'pending',
  'dispatching',
  'dispatched',
  'agent_done',
  'reviewing',
  'completed',
  'failed',
])
const RUN_STATUSES = new Set<RunStatus>([
  'planning',
  'intent_recognition',
  'info_collecting',
  'analyzing',
  'designing',
  'specifying',
  'executing',
  'completed',
  'blocked',
])

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function isValidRunId(runId: string): boolean {
  return runId.length > 0 && runId.length <= 128 && RUN_ID_PATTERN.test(runId) && !runId.includes('..')
}

function getPredictedHookDecision(
  status: RunStatus | undefined,
  action: DispatchInstruction['action'],
): 'approve' | 'allow' | 'block' {
  if (status === 'blocked') {
    return 'block'
  }

  if (status !== 'executing') {
    return 'allow'
  }

  if (action === 'dispatch_subagent') {
    return 'approve'
  }

  if (action === 'await_human_gate' || action === 'blocked') {
    return 'block'
  }

  return 'allow'
}

function getExecutionPlanTaskIds(instruction: DispatchInstruction): string[] {
  if (instruction.phase === 'designing') {
    return ['designing']
  }

  if (instruction.phase === 'specifying') {
    return ['specifying']
  }

  return instruction.task_ids ?? []
}

function getExecutionPlanSubagentType(
  instruction: DispatchInstruction,
  task: Task | undefined,
  taskId: string,
): string {
  if (instruction.phase === 'review') {
    return 'code-reviewer'
  }

  if (instruction.phase === 'designing') {
    return 'product-designer'
  }

  if (instruction.phase === 'specifying') {
    return 'architect'
  }

  if (instruction.subagent_type === 'developer-by-complexity') {
    return getTaskAgentType(task ?? { id: taskId })
  }

  return instruction.subagent_type ?? getTaskAgentType(task ?? { id: taskId })
}

function normalizeBlockedBy(task: Task) {
  return Array.isArray(task.blocked_by) ? task.blocked_by : []
}

function hasReviewField(task: Task) {
  return Object.prototype.hasOwnProperty.call(task, 'review_status')
}

function getReviewMode(tasks: Task[]) {
  const hasAnyReviewField = tasks.some((task) => hasReviewField(task))
  const allHaveReviewField = tasks.length > 0 && tasks.every((task) => hasReviewField(task))

  if (!hasAnyReviewField) {
    return 'legacy' as const
  }

  return allHaveReviewField ? ('reviewed' as const) : ('mixed' as const)
}

function isTaskDone(task: Task, reviewMode: 'legacy' | 'reviewed' | 'mixed') {
  if (task.status !== 'completed') {
    return false
  }

  if (reviewMode === 'legacy') {
    return true
  }

  if (reviewMode === 'reviewed') {
    return task.review_status === 'approved'
  }

  return hasReviewField(task) && task.review_status === 'approved'
}

function getTaskAgentType(task: Task) {
  if (task.agent_type) {
    return task.agent_type
  }
  return task.complexity === 'small' ? 'haiku-dev' : 'sonnet-dev'
}

function firstIssueDescription(report: ReviewReport | null) {
  const first = report?.issues?.find(
    (issue) => typeof issue.description === 'string' && issue.description.trim().length > 0,
  )
  return first?.description?.trim() ?? null
}

function canConsumeReviewReport(status?: TaskStatus) {
  return status === 'dispatched' || status === 'reviewing' || status === 'agent_done' || status === 'completed'
}

function normalizePlanBlockedBy(task: PlanTask) {
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
    status: existing?.status ?? 'pending',
    blocked_by: normalizePlanBlockedBy(task),
    review_status: existing?.review_status ?? 'pending',
    retry_count: existing?.retry_count ?? 0,
    complexity: task.complexity,
    agent_type: task.agent_type,
    agent_id: existing?.agent_id ?? null,
    task_type: task.task_type,
    criticality: task.criticality,
    test_command: task.test_command,
    dispatch_count: existing?.dispatch_count ?? 0,
    last_artifact: existing?.last_artifact ?? null,
    last_error: existing?.last_error ?? null,
    updated_at: existing?.updated_at,
    spec_source: specSource ?? existing?.spec_source,
  }
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
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
  const seen = new Set<string>()

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
        const cyclePath = [...stack.slice(startIndex), dep].join(' -> ')
        if (!seen.has(cyclePath)) {
          seen.add(cyclePath)
          cycles.push(cyclePath)
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

function summarizeState(state: RunState | null, runId: string | null) {
  const tasks = Array.isArray(state?.tasks) ? state!.tasks! : []
  const reviewMode = getReviewMode(tasks)
  const doneIds = new Set(tasks.filter((task) => isTaskDone(task, reviewMode)).map((task) => task.id))
  const dispatchablePendingTasks = tasks.filter(
    (task) => task.status === 'pending' && normalizeBlockedBy(task).every((dep) => doneIds.has(dep)),
  )
  const agentDoneTasks = tasks.filter((task) => task.status === 'agent_done')
  const reviewableTasks = tasks.filter((task) => {
    if (task.status === 'agent_done') {
      return (task.review_status ?? 'pending') === 'pending'
    }
    if (reviewMode === 'legacy') {
      return false
    }
    return task.status === 'completed' && (task.review_status ?? 'pending') === 'pending'
  })
  const retryableTasks = tasks.filter((task) => task.status === 'failed')

  return {
    run_id: runId,
    status: state?.status ?? null,
    design_status: state?.design_status ?? null,
    spec_status: state?.spec_status ?? null,
    spec_path: state?.spec_path ?? null,
    task_count: tasks.length,
    review_mode: reviewMode,
    dispatchable_pending_tasks: dispatchablePendingTasks.map((task) => task.id),
    agent_done_tasks: agentDoneTasks.map((task) => task.id),
    reviewable_tasks: reviewableTasks.map((task) => task.id),
    retryable_tasks: retryableTasks.map((task) => task.id),
    task_status_counts: Object.fromEntries(
      [...TASK_STATUSES].map((status) => [status, tasks.filter((task) => task.status === status).length]),
    ),
  }
}

function validateStateConsistency(state: RunState) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const taskIds = new Set(tasks.map((task) => task.id))
  const missingDepRefs: Array<{ task: string; missingDep: string }> = []

  for (const task of tasks) {
    for (const dep of normalizeBlockedBy(task)) {
      if (!taskIds.has(dep)) {
        missingDepRefs.push({ task: task.id, missingDep: dep })
      }
    }
  }

  const dependencyCycles = findDependencyCycles(tasks, taskIds)
  const invalidTaskStatuses = tasks
    .filter((task) => !task.status || !TASK_STATUSES.has(task.status))
    .map((task) => ({ task: task.id, status: task.status ?? 'undefined' }))
  const invalidRunStatus = state.status && !RUN_STATUSES.has(state.status) ? state.status : null
  const reviewMode = getReviewMode(tasks)
  const allDone = tasks.length > 0 && tasks.every((task) => isTaskDone(task, reviewMode))
  const stateConsistency: string[] = []

  if (state.status === 'completed' && !allDone) {
    stateConsistency.push('run status is completed but not all tasks are done')
  }

  if (
    state.status === 'planning' &&
    tasks.some((task) =>
      ['dispatched', 'agent_done', 'reviewing', 'completed', 'failed'].includes(task.status ?? ''),
    )
  ) {
    stateConsistency.push('run status is planning but task statuses indicate execution has started')
  }

  return {
    ok:
      missingDepRefs.length === 0 &&
      dependencyCycles.length === 0 &&
      invalidTaskStatuses.length === 0 &&
      invalidRunStatus === null &&
      stateConsistency.length === 0,
    issues: {
      missingDepRefs,
      dependencyCycles,
      invalidTaskStatuses,
      invalidRunStatus,
      stateConsistency,
    },
  }
}

async function reconcilePhase(state: RunState, runId: string, runtimeRoot: string, transitions: string[]) {
  const artifactPath = (name: string) => resolve(runtimeRoot, 'runs', runId, 'artifacts', name)
  const resolveSpecPath = () => (state.spec_path ? resolve(runtimeRoot, '..', state.spec_path.replace(/^\.claude\//, '')) : null)

  if (state.status === 'info_collecting' && existsSync(artifactPath('info-collection.json'))) {
    state.status = 'analyzing'
    transitions.push('status info_collecting -> analyzing')
  }

  if (state.status === 'analyzing' && existsSync(artifactPath('requirement-analysis.json'))) {
    state.status = 'designing'
    transitions.push('status analyzing -> designing')
  }

  if (state.status === 'designing' && existsSync(artifactPath('product-spec.json'))) {
    const productSpec = await readJson<ProductSpec>(artifactPath('product-spec.json'))
    if (productSpec?.spec_path) {
      state.spec_path = productSpec.spec_path
    }

    const resolvedSpecPath = resolveSpecPath()
    if (resolvedSpecPath && existsSync(resolvedSpecPath) && (state.design_status ?? 'draft') === 'approved') {
      state.status = 'specifying'
      transitions.push('status designing -> specifying')
    }
  }

  if (state.status === 'specifying') {
    const planPath = artifactPath('plan.json')
    const resolvedSpecPath = resolveSpecPath()
    const hasApprovedSpecInputs =
      existsSync(planPath) &&
      Boolean(resolvedSpecPath && existsSync(resolvedSpecPath)) &&
      state.spec_status === 'approved'

    if (existsSync(planPath)) {
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

      const missingCriticalTddCommands = syncedTasks
        .filter((task) => task.task_type === 'tdd' && task.criticality === 'critical' && !task.test_command)
        .map((task) => task.id)

      if (hasApprovedSpecInputs && missingCriticalTddCommands.length > 0) {
        state.status = 'blocked'
        state.blocked_reason = `Critical TDD tasks missing test_command before execution: ${missingCriticalTddCommands.join(', ')}`
        transitions.push('status specifying -> blocked (missing critical tdd test_command)')
        return
      }
    }

    if (hasApprovedSpecInputs) {
      state.status = 'executing'
      state.blocked_reason = null
      transitions.push('status specifying -> executing')
    }
  }
}

async function reconcileTasks(state: RunState, runId: string, runtimeRoot: string, transitions: string[]) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const artifactPath = (name: string) => resolve(runtimeRoot, 'runs', runId, 'artifacts', name)
  let hasFailed = false
  let hasInFlight = false

  for (const task of tasks) {
    const devReportPath = artifactPath(`dev-report-${task.id}.json`)
    const reviewReportPath = artifactPath(`review-report-${task.id}.json`)

    if (task.status === 'dispatched' && existsSync(devReportPath)) {
      const devReport = await readJson<DevReport>(devReportPath)
      task.status = 'agent_done'
      task.last_artifact = devReportPath
      task.last_error = devReport?.test_result === 'fail' ? 'Developer report recorded failing tests' : null
      transitions.push(`task ${task.id}: dispatched -> agent_done`)
    }

    if (canConsumeReviewReport(task.status) && existsSync(reviewReportPath)) {
      const reviewReport = await readJson<ReviewReport>(reviewReportPath)
      const verdict = reviewReport?.verdict
      task.last_artifact = reviewReportPath

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

  if (
    tasks.length > 0 &&
    tasks.every((task) => task.status === 'completed' && task.review_status === 'approved')
  ) {
    state.status = 'completed'
    state.blocked_reason = null
    transitions.push('status executing -> completed')
    return
  }

  if (!hasInFlight && hasFailed) {
    state.status = 'blocked'
    state.blocked_reason =
      'One or more tasks failed and require manual intervention or retry dispatch.'
    transitions.push('status executing -> blocked')
  }
}

async function predictReconciledState(originalState: RunState, runId: string, runtimeRoot: string) {
  const state = cloneState(originalState)
  const transitions: string[] = []
  await reconcilePhase(state, runId, runtimeRoot, transitions)
  if (state.status === 'executing') {
    await reconcileTasks(state, runId, runtimeRoot, transitions)
  }
  return { state, transitions }
}

function computeDispatchInstruction(
  state: RunState,
  runId: string,
  runtimeRoot: string,
): DispatchInstruction {
  const status = state.status ?? 'planning'
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const maxRetries = typeof state.max_retries === 'number' ? state.max_retries : 2

  if (status === 'planning') {
    return {
      action: 'none',
      phase: 'planning',
      run_id: runId,
      notes: ['Planning is active. Continue requirement intake and initialize run metadata.'],
    }
  }

  if (status === 'intent_recognition') {
    return {
      action: 'none',
      phase: 'intent_recognition',
      run_id: runId,
      notes: ['Determine whether the request is already clear enough to skip research/design.'],
    }
  }

  if (status === 'info_collecting') {
    return {
      action: 'dispatch_subagent',
      phase: 'info_collecting',
      run_id: runId,
      subagent_type: 'info-collector',
      mode: 'serial',
      notes: ['Dispatch info-collector to produce info-collection.json.'],
    }
  }

  if (status === 'analyzing') {
    return {
      action: 'dispatch_subagent',
      phase: 'analyzing',
      run_id: runId,
      subagent_type: 'requirement-analyst',
      mode: 'serial',
      notes: ['Dispatch requirement-analyst to produce requirement-analysis.json.'],
    }
  }

  if (status === 'designing') {
    const productSpecPath = resolve(runtimeRoot, 'runs', runId, 'artifacts', 'product-spec.json')
    const resolvedSpecPath = state.spec_path ? resolve(dirname(runtimeRoot), state.spec_path.replace(/^\.claude\//, '')) : null
    const hasDesignArtifacts = existsSync(productSpecPath) && Boolean(resolvedSpecPath && existsSync(resolvedSpecPath))

    if (!hasDesignArtifacts) {
      return {
        action: 'dispatch_subagent',
        phase: 'designing',
        run_id: runId,
        subagent_type: 'product-designer',
        mode: 'serial',
        notes: ['Dispatch product-designer to produce product-spec outputs and the design document.'],
      }
    }

    if ((state.design_status ?? 'draft') !== 'approved') {
      return {
        action: 'await_human_gate',
        phase: 'designing',
        run_id: runId,
        notes: ['Design artifacts are ready and waiting for design approval or rework.'],
      }
    }

    return {
      action: 'none',
      phase: 'designing',
      run_id: runId,
      notes: ['Design approved. Reconcile state to advance into specifying.'],
    }
  }

  if (status === 'specifying') {
    if (!existsSync(resolve(runtimeRoot, 'runs', runId, 'artifacts', 'plan.json'))) {
      return {
        action: 'dispatch_subagent',
        phase: 'specifying',
        run_id: runId,
        subagent_type: 'architect',
        mode: 'serial',
        notes: ['Dispatch architect to produce the spec document and plan.json.'],
      }
    }

    if (state.spec_status !== 'approved') {
      return {
        action: 'await_human_gate',
        phase: 'specifying',
        run_id: runId,
        notes: ['Specification artifacts are ready and waiting for spec approval or rework.'],
      }
    }

    return {
      action: 'none',
      phase: 'specifying',
      run_id: runId,
      notes: ['Specification approved. Sync tasks and transition to executing.'],
    }
  }

  if (status === 'completed') {
    return {
      action: 'none',
      phase: 'completed',
      run_id: runId,
      notes: ['Run is completed.'],
    }
  }

  if (status === 'blocked') {
    return {
      action: 'blocked',
      phase: 'blocked',
      run_id: runId,
      notes: ['Run is blocked and requires manual intervention.'],
    }
  }

  const reviewMode = getReviewMode(tasks)
  const doneIds = new Set(tasks.filter((task) => isTaskDone(task, reviewMode)).map((task) => task.id))

  const needsReview = tasks.filter((task) => {
    if (task.status === 'agent_done') {
      return (task.review_status ?? 'pending') === 'pending'
    }
    if (reviewMode === 'legacy') {
      return false
    }
    return task.status === 'completed' && (task.review_status ?? 'pending') === 'pending'
  })

  if (needsReview.length > 0) {
    return {
      action: 'dispatch_subagent',
      phase: 'review',
      run_id: runId,
      task_ids: needsReview.map((task) => task.id),
      subagent_type: 'code-reviewer',
      mode: needsReview.length > 1 ? 'parallel' : 'serial',
      notes: ['Dispatch code-reviewer for each reviewable task.'],
    }
  }

  const needsRetry = tasks.filter(
    (task) => task.status === 'failed' && (task.retry_count ?? 0) < maxRetries,
  )
  if (needsRetry.length > 0) {
    return {
      action: 'dispatch_subagent',
      phase: 'retry',
      run_id: runId,
      task_ids: needsRetry.map((task) => task.id),
      subagent_type: 'sonnet-dev',
      mode: needsRetry.length > 1 ? 'parallel' : 'serial',
      notes: ['Re-dispatch retryable failed tasks to sonnet-dev with failure context.'],
    }
  }

  const needsDispatch = tasks.filter(
    (task) => task.status === 'pending' && normalizeBlockedBy(task).every((dep) => doneIds.has(dep)),
  )

  if (needsDispatch.length > 0) {
    const hasMixedAgents = new Set(needsDispatch.map(getTaskAgentType)).size > 1
    return {
      action: 'dispatch_subagent',
      phase: 'dispatch',
      run_id: runId,
      task_ids: needsDispatch.map((task) => task.id),
      subagent_type: hasMixedAgents ? 'developer-by-complexity' : getTaskAgentType(needsDispatch[0]),
      mode: needsDispatch.length > 1 ? 'parallel' : 'serial',
      notes: [
        'Dispatch pending tasks whose dependencies are satisfied. Use haiku-dev for small tasks and sonnet-dev for medium/hard tasks.',
      ],
    }
  }

  return {
    action: 'none',
    phase: 'dispatch',
    run_id: runId,
    notes: ['No immediate dispatch action. Wait for running subagents or new state changes.'],
  }
}

function buildExecutionPlan(
  instruction: DispatchInstruction,
  state: RunState,
  runtimeRoot: string,
  runId: string,
) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const taskSpecsRoot = resolve(runtimeRoot, 'task-specs', runId, 'subtasks')
  const runArtifactsRoot = resolve(runtimeRoot, 'runs', runId, 'artifacts')
  const specPathAbsolute = state.spec_path ? resolve(dirname(runtimeRoot), state.spec_path.replace(/^\.claude\//, '')) : null

  if (instruction.action !== 'dispatch_subagent') {
    return { ready: false, reason: 'No dispatchable action at this time.', jobs: [] as ExecutionJob[] }
  }

  const taskIds = getExecutionPlanTaskIds(instruction)
  const jobs = taskIds.map((taskId) => {
    const task = taskMap.get(taskId)
    const subagentType = getExecutionPlanSubagentType(instruction, task, taskId)

    return {
      task_id: taskId,
      title:
        instruction.phase === 'designing'
          ? 'Product design'
          : instruction.phase === 'specifying'
            ? 'Architecture specification'
            : task?.title ?? null,
      subagent_type: subagentType,
      spec_path:
        instruction.phase === 'review'
          ? null
          : instruction.phase === 'designing' || instruction.phase === 'specifying'
            ? specPathAbsolute
            : resolve(taskSpecsRoot, `${taskId}.md`),
      expected_artifacts:
        instruction.phase === 'review'
          ? [resolve(runArtifactsRoot, `review-report-${taskId}.json`)]
          : instruction.phase === 'designing'
            ? [resolve(runArtifactsRoot, 'product-spec.json'), ...(specPathAbsolute ? [specPathAbsolute] : [])]
            : instruction.phase === 'specifying'
              ? [resolve(runArtifactsRoot, 'plan.json'), ...(specPathAbsolute ? [specPathAbsolute] : [])]
              : [resolve(runArtifactsRoot, `dev-report-${taskId}.json`)],
      complexity: instruction.phase === 'designing' || instruction.phase === 'specifying' ? 'medium' : task?.complexity ?? null,
      task_type: task?.task_type ?? null,
      criticality: task?.criticality ?? null,
      test_command: task?.test_command ?? null,
    }
  })

  return {
    ready: true,
    mode: instruction.mode ?? 'serial',
    jobs,
  }
}

async function listRegisteredSkillNames() {
  try {
    const entries = await readdir(SKILLS_ROOT, { withFileTypes: true })
    return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  } catch {
    return new Set<string>()
  }
}

async function determineBaselineStatus(
  metadata: EvalMetadata | null,
  caseDir: string,
): Promise<ValidationOutput['baseline_status']> {
  const baseline = metadata?.fixture_expectations?.baseline
  if (!baseline || baseline.mode === 'disabled') {
    return {
      mode: baseline?.mode ?? 'disabled',
      status: 'not_requested',
      details: 'Baseline execution is explicitly disabled for this fixture.',
    }
  }

  if (baseline.mode === 'snapshot_prompt') {
    const snapshotPath = baseline.snapshot_path
      ? resolve(caseDir, baseline.snapshot_path)
      : resolve(caseDir, '../skill-snapshot')
    if (existsSync(snapshotPath)) {
      return {
        mode: baseline.mode,
        status: 'valid',
        details: `Snapshot prompt baseline is available at ${snapshotPath}.`,
      }
    }
    return {
      mode: baseline.mode,
      status: 'misconfigured',
      details: `Snapshot prompt baseline path does not exist: ${snapshotPath}.`,
    }
  }

  const skillName = baseline.skill_name?.trim()
  if (!skillName) {
    return {
      mode: baseline.mode,
      status: 'misconfigured',
      details: 'registered_skill baseline requires baseline.skill_name.',
    }
  }

  const registered = await listRegisteredSkillNames()
  if (registered.has(skillName)) {
    return {
      mode: baseline.mode,
      status: 'valid',
      details: `Registered skill baseline '${skillName}' is present in plugin skills/.`,
    }
  }

  return {
    mode: baseline.mode,
    status: 'unsupported_in_environment',
    details: `Registered skill baseline '${skillName}' is not installed as a callable plugin skill in this environment.`,
  }
}

function makeCheck(name: string, ok: boolean, expected?: unknown, actual?: unknown, details?: string): ScenarioCheck {
  return { name, ok, expected, actual, details }
}

async function main() {
  const fixtureDir = resolve(process.argv[2] ?? process.cwd())
  const variant = process.argv[3] ?? 'with_skill'
  const caseDir = resolve(fixtureDir, '..')
  const metadataPath = resolve(caseDir, 'eval_metadata.json')
  const runtimeRoot = resolve(fixtureDir, '.claude', 'selfwork')
  const activeFile = resolve(runtimeRoot, 'active')
  const metadata = await readJson<EvalMetadata>(metadataPath)
  const expectations = metadata?.fixture_expectations ?? {}
  const issues: string[] = []
  const warnings: string[] = []
  const scenarioChecks: ScenarioCheck[] = []

  scenarioChecks.push(
    makeCheck(
      'fixture directory exists',
      existsSync(fixtureDir),
      true,
      existsSync(fixtureDir),
      fixtureDir,
    ),
  )
  scenarioChecks.push(
    makeCheck(
      'runtime root exists',
      existsSync(runtimeRoot),
      true,
      existsSync(runtimeRoot),
      runtimeRoot,
    ),
  )

  if (!metadata) {
    issues.push(`Missing or invalid eval metadata: ${metadataPath}`)
  }

  let activeRun: string | null = null
  if (existsSync(activeFile)) {
    const value = (await readFile(activeFile, 'utf8')).trim()
    activeRun = value || null
  }

  const requireActiveRun = expectations.require_active_run ?? false
  scenarioChecks.push(
    makeCheck(
      'active run presence',
      requireActiveRun ? Boolean(activeRun) : true,
      requireActiveRun,
      Boolean(activeRun),
      activeRun ?? 'no active run',
    ),
  )

  if (activeRun && !isValidRunId(activeRun)) {
    issues.push(`Active run id is invalid: ${activeRun}`)
  }

  let state: RunState | null = null
  if (activeRun && isValidRunId(activeRun)) {
    const statePath = resolve(runtimeRoot, 'runs', activeRun, 'state.json')
    state = await readJson<RunState>(statePath)
    scenarioChecks.push(
      makeCheck('state.json exists and parses', Boolean(state), true, Boolean(state), statePath),
    )
    if (!state) {
      issues.push(`Missing or invalid state.json: ${statePath}`)
    }
  } else if (requireActiveRun) {
    issues.push('Fixture requires an active run but none was found.')
  }

  if (!state || !activeRun) {
    const baselineStatus = await determineBaselineStatus(
      metadata ?? { eval_id: -1, fixture_expectations: { baseline: { mode: 'disabled' } } },
      caseDir,
    )

    const output: ValidationOutput = {
      ok: false,
      eval_id: metadata?.eval_id ?? null,
      variant,
      fixture_dir: fixtureDir,
      active_run: activeRun,
      state_summary: summarizeState(state, activeRun),
      scenario_checks: scenarioChecks,
      predicted_protocol: {
        reconcile: null,
        dispatch_next: null,
        execute_next: null,
      },
      baseline_status: baselineStatus,
      issues,
      warnings,
    }

    print(output)
    process.exitCode = 1
    return
  }

  const consistency = validateStateConsistency(state)
  scenarioChecks.push(
    makeCheck('task and dependency consistency', consistency.ok, true, consistency.ok),
  )
  if (!consistency.ok) {
    issues.push(JSON.stringify(consistency.issues))
  }

  if (expectations.expected_status) {
    scenarioChecks.push(
      makeCheck(
        'expected run status',
        state.status === expectations.expected_status,
        expectations.expected_status,
        state.status ?? null,
      ),
    )
  }

  if (expectations.expected_design_status) {
    scenarioChecks.push(
      makeCheck(
        'expected design status',
        state.design_status === expectations.expected_design_status,
        expectations.expected_design_status,
        state.design_status ?? null,
      ),
    )
  }

  if (expectations.expected_spec_status) {
    scenarioChecks.push(
      makeCheck(
        'expected spec status',
        state.spec_status === expectations.expected_spec_status,
        expectations.expected_spec_status,
        state.spec_status ?? null,
      ),
    )
  }

  if (expectations.require_spec_path) {
    scenarioChecks.push(
      makeCheck('spec_path present', Boolean(state.spec_path), true, state.spec_path ?? null),
    )
  }

  const resolvedSpecPath = state.spec_path
    ? resolve(dirname(runtimeRoot), state.spec_path.replace(/^\.claude\//, ''))
    : null

  if (expectations.require_spec_path_exists) {
    scenarioChecks.push(
      makeCheck(
        'spec_path target exists',
        Boolean(resolvedSpecPath && existsSync(resolvedSpecPath)),
        true,
        resolvedSpecPath ?? null,
      ),
    )
  }

  for (const artifact of expectations.required_run_artifacts ?? []) {
    const path = resolve(runtimeRoot, 'runs', activeRun, 'artifacts', artifact)
    scenarioChecks.push(makeCheck(`required artifact ${artifact}`, existsSync(path), true, existsSync(path), path))
  }

  for (const artifact of expectations.forbidden_run_artifacts ?? []) {
    const path = resolve(runtimeRoot, 'runs', activeRun, 'artifacts', artifact)
    scenarioChecks.push(makeCheck(`forbidden artifact ${artifact}`, !existsSync(path), false, existsSync(path), path))
  }

  for (const doc of expectations.required_docs ?? []) {
    const path = resolve(runtimeRoot, 'docs', doc)
    scenarioChecks.push(makeCheck(`required doc ${doc}`, existsSync(path), true, existsSync(path), path))
  }

  for (const doc of expectations.forbidden_docs ?? []) {
    const path = resolve(runtimeRoot, 'docs', doc)
    scenarioChecks.push(makeCheck(`forbidden doc ${doc}`, !existsSync(path), false, existsSync(path), path))
  }

  for (const taskId of expectations.required_task_specs ?? []) {
    const path = resolve(runtimeRoot, 'task-specs', activeRun, 'subtasks', `${taskId}.md`)
    scenarioChecks.push(makeCheck(`required task spec ${taskId}`, existsSync(path), true, existsSync(path), path))
  }

  for (const taskId of expectations.forbidden_task_specs ?? []) {
    const path = resolve(runtimeRoot, 'task-specs', activeRun, 'subtasks', `${taskId}.md`)
    scenarioChecks.push(makeCheck(`forbidden task spec ${taskId}`, !existsSync(path), false, existsSync(path), path))
  }

  const summaryBefore = summarizeState(state, activeRun)

  if (typeof expectations.expected_dispatchable_pending_tasks === 'number') {
    scenarioChecks.push(
      makeCheck(
        'dispatchable pending task count',
        (summaryBefore.dispatchable_pending_tasks as string[]).length ===
          expectations.expected_dispatchable_pending_tasks,
        expectations.expected_dispatchable_pending_tasks,
        (summaryBefore.dispatchable_pending_tasks as string[]).length,
      ),
    )
  }

  if (typeof expectations.expected_agent_done_tasks === 'number') {
    scenarioChecks.push(
      makeCheck(
        'agent_done task count',
        (summaryBefore.agent_done_tasks as string[]).length === expectations.expected_agent_done_tasks,
        expectations.expected_agent_done_tasks,
        (summaryBefore.agent_done_tasks as string[]).length,
      ),
    )
  }

  const { state: reconciledState, transitions } = await predictReconciledState(state, activeRun, runtimeRoot)
  const summaryAfter = summarizeState(reconciledState, activeRun)
  const dispatchInstruction = computeDispatchInstruction(reconciledState, activeRun, runtimeRoot)
  const executionPlan = buildExecutionPlan(dispatchInstruction, reconciledState, runtimeRoot, activeRun)
  const predictedHookDecision = getPredictedHookDecision(
    reconciledState.status,
    dispatchInstruction.action,
  )

  if (expectations.expected_reconciled_status) {
    scenarioChecks.push(
      makeCheck(
        'post-reconcile status stays on expected branch',
        reconciledState.status === expectations.expected_reconciled_status,
        expectations.expected_reconciled_status,
        reconciledState.status ?? null,
        transitions.join('; ') || 'no transitions',
      ),
    )
  } else if (expectations.expected_status) {
    scenarioChecks.push(
      makeCheck(
        'post-reconcile status stays on expected branch',
        reconciledState.status === expectations.expected_status,
        expectations.expected_status,
        reconciledState.status ?? null,
        transitions.join('; ') || 'no transitions',
      ),
    )
  }

  if (expectations.expected_blocked_reason_includes) {
    scenarioChecks.push(
      makeCheck(
        'blocked reason includes expected text',
        typeof reconciledState.blocked_reason === 'string' && reconciledState.blocked_reason.includes(expectations.expected_blocked_reason_includes),
        expectations.expected_blocked_reason_includes,
        reconciledState.blocked_reason ?? null,
      ),
    )
  }

  if (expectations.expected_next_action) {
    scenarioChecks.push(
      makeCheck(
        'dispatch-next action',
        dispatchInstruction.action === expectations.expected_next_action,
        expectations.expected_next_action,
        dispatchInstruction.action,
      ),
    )
  }

  if (expectations.expected_phase) {
    scenarioChecks.push(
      makeCheck(
        'dispatch-next phase',
        dispatchInstruction.phase === expectations.expected_phase,
        expectations.expected_phase,
        dispatchInstruction.phase,
      ),
    )
  }

  if (typeof expectations.expected_subagent_type !== 'undefined') {
    scenarioChecks.push(
      makeCheck(
        'dispatch-next subagent type',
        (dispatchInstruction.subagent_type ?? null) === expectations.expected_subagent_type,
        expectations.expected_subagent_type,
        dispatchInstruction.subagent_type ?? null,
      ),
    )
  }

  if (typeof expectations.expected_mode !== 'undefined') {
    scenarioChecks.push(
      makeCheck(
        'dispatch-next mode',
        (dispatchInstruction.mode ?? null) === expectations.expected_mode,
        expectations.expected_mode,
        dispatchInstruction.mode ?? null,
      ),
    )
  }

  for (const [taskId, expectedStatus] of Object.entries(expectations.expected_task_statuses ?? {})) {
    const task = reconciledState.tasks?.find((candidate) => candidate.id === taskId)
    scenarioChecks.push(
      makeCheck(
        `task ${taskId} reconciled status`,
        task?.status === expectedStatus,
        expectedStatus,
        task?.status ?? null,
      ),
    )
  }

  for (const [taskId, expectedReviewStatus] of Object.entries(expectations.expected_task_review_statuses ?? {})) {
    const task = reconciledState.tasks?.find((candidate) => candidate.id === taskId)
    scenarioChecks.push(
      makeCheck(
        `task ${taskId} review status`,
        (task?.review_status ?? null) === expectedReviewStatus,
        expectedReviewStatus,
        task?.review_status ?? null,
      ),
    )
  }

  for (const [taskId, expectedSnippet] of Object.entries(expectations.expected_task_last_error_includes ?? {})) {
    const task = reconciledState.tasks?.find((candidate) => candidate.id === taskId)
    scenarioChecks.push(
      makeCheck(
        `task ${taskId} last_error includes expected text`,
        typeof task?.last_error === 'string' && task.last_error.includes(expectedSnippet),
        expectedSnippet,
        task?.last_error ?? null,
      ),
    )
  }

  if (typeof expectations.expect_hook_continues_ordinary_execution === 'boolean') {
    scenarioChecks.push(
      makeCheck(
        'hook ordinary execution continuation',
        expectations.expect_hook_continues_ordinary_execution ? predictedHookDecision === 'approve' : predictedHookDecision !== 'approve',
        expectations.expect_hook_continues_ordinary_execution ? 'approve' : 'not approve',
        predictedHookDecision,
      ),
    )
  }

  const baselineStatus = await determineBaselineStatus(metadata, caseDir)

  for (const check of scenarioChecks) {
    if (!check.ok) {
      issues.push(`${check.name} failed`)
    }
  }

  if (baselineStatus.status === 'misconfigured') {
    issues.push(baselineStatus.details)
  }
  if (baselineStatus.status === 'unsupported_in_environment') {
    warnings.push(baselineStatus.details)
  }

  const output: ValidationOutput = {
    ok: issues.length === 0,
    eval_id: metadata?.eval_id ?? null,
    variant,
    fixture_dir: fixtureDir,
    active_run: activeRun,
    state_summary: {
      before_reconcile: summaryBefore,
      after_reconcile: summaryAfter,
      spec_path_resolved: resolvedSpecPath,
      consistency: consistency.issues,
    },
    scenario_checks: scenarioChecks,
    predicted_protocol: {
      reconcile: {
        transitions,
        resulting_status: reconciledState.status ?? null,
        blocked_reason: reconciledState.blocked_reason ?? null,
      },
      dispatch_next: dispatchInstruction,
      execute_next: executionPlan,
      hook: {
        decision: predictedHookDecision,
      },
    },
    baseline_status: baselineStatus,
    issues,
    warnings,
  }

  print(output)
  if (!output.ok) {
    process.exitCode = 1
  }
}

void main()
