#!/usr/bin/env bun
/**
 * Structural Readiness Scoring (Track A)
 *
 * Scores specification completeness using deterministic structural checks.
 * Exit code 0 if score >= threshold, 1 otherwise.
 *
 * Usage:
 *   bun run score-spec.ts --feature <feature-name> [--threshold <score>]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface ScoreResult {
  total: number;
  breakdown: {
    structure: number;
    testability: number;
    interfaces: number;
    constraints: number;
    verification: number;
  };
  penalties: Array<{
    reason: string;
    points: number;
  }>;
  gaps: Array<{
    category: string;
    description: string;
    blocking: boolean;
  }>;
  last_updated: string;
}

// Parse command line arguments
const args = process.argv.slice(2);
let featureName = '';
let threshold = 95;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--feature' && i + 1 < args.length) {
    featureName = args[i + 1];
    i++;
  } else if (args[i] === '--threshold' && i + 1 < args.length) {
    threshold = parseInt(args[i + 1], 10);
    i++;
  }
}

if (!featureName) {
  console.error('Usage: bun run score-spec.ts --feature <feature-name> [--threshold <score>]');
  process.exit(1);
}

const specDir = join('.works/spec', featureName);
const contractsPath = join(specDir, 'contracts.md');
const tasksPath = join(specDir, 'tasks.md');
const scoreOutputPath = join(specDir, 'score.json');

// Check if spec files exist
if (!existsSync(contractsPath)) {
  console.error(`Error: contracts.md not found at ${contractsPath}`);
  process.exit(1);
}

if (!existsSync(tasksPath)) {
  console.error(`Error: tasks.md not found at ${tasksPath}`);
  process.exit(1);
}

// Read spec files
const contractsContent = readFileSync(contractsPath, 'utf-8');
const tasksContent = readFileSync(tasksPath, 'utf-8');

// Initialize score result
const result: ScoreResult = {
  total: 0,
  breakdown: {
    structure: 0,
    testability: 0,
    interfaces: 0,
    constraints: 0,
    verification: 0,
  },
  penalties: [],
  gaps: [],
  last_updated: new Date().toISOString(),
};

/**
 * Checks whether the markdown content contains any of the specified headings at levels 1–3.
 *
 * @param content - The markdown text to search
 * @param sectionNames - One or more heading names to look for (matched case-insensitively)
 * @returns `true` if any of the provided heading names appears as an H1–H3 heading in `content`, `false` otherwise
 */
function hasSection(content: string, ...sectionNames: string[]): boolean {
  return sectionNames.some(name => {
    const pattern = new RegExp(`^#{1,3}\\s+${name}`, 'mi');
    return pattern.test(content);
  });
}

/**
 * Count the number of occurrences of a regular expression within a string.
 *
 * @param content - The text to search
 * @param pattern - The regular expression to match against `content`
 * @returns The number of matches found (0 if none)
 */
function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Finds placeholder tokens commonly used to mark incomplete content.
 *
 * @param content - The text to scan for placeholder tokens
 * @returns An array of placeholder tokens found in `content` (e.g., `TBD`, `TODO`, `???`, `[later]`)
 */
function hasPlaceholders(content: string): string[] {
  const placeholders = ['TBD', 'TODO', '???', '[later]'];
  const found: string[] = [];

  for (const placeholder of placeholders) {
    if (content.includes(placeholder)) {
      found.push(placeholder);
    }
  }

  return found;
}

// 1. STRUCTURE SCORING (25 pts)
let structureScore = 0;

// Goal, Scope, Non-Goals sections (5 pts each)
if (hasSection(contractsContent, 'Goal', 'Purpose', 'Objective')) {
  structureScore += 5;
} else {
  result.gaps.push({
    category: 'structure',
    description: 'Missing Goal/Purpose/Objective section in contracts.md',
    blocking: true,
  });
}

if (hasSection(contractsContent, 'Scope', 'What.*Included')) {
  structureScore += 5;
} else {
  result.gaps.push({
    category: 'structure',
    description: 'Missing Scope section in contracts.md',
    blocking: true,
  });
}

if (hasSection(contractsContent, 'Non-Goals', 'Out of Scope', 'Not Included')) {
  structureScore += 5;
} else {
  result.gaps.push({
    category: 'structure',
    description: 'Missing Non-Goals/Out of Scope section',
    blocking: false,
  });
}

// Interfaces, Data Model (5 pts each)
if (hasSection(contractsContent, 'Interface', 'API', 'Endpoint', 'Input Contract', 'Output Contract')) {
  structureScore += 5;
} else {
  result.gaps.push({
    category: 'structure',
    description: 'Missing Interface/API/Contract definitions',
    blocking: true,
  });
}

if (hasSection(contractsContent, 'Data Model', 'Schema', 'Type', 'Response Structure')) {
  structureScore += 5;
} else {
  result.gaps.push({
    category: 'structure',
    description: 'Missing Data Model/Schema/Type definitions',
    blocking: false,
  });
}

result.breakdown.structure = structureScore;

// 2. TESTABILITY SCORING (25 pts)
let testabilityScore = 0;

// Check for task checklists
const checklistCount = countMatches(tasksContent, /^- \[ \]/gm);
if (checklistCount >= 3) {
  testabilityScore += 10;
} else if (checklistCount > 0) {
  testabilityScore += 5;
  result.gaps.push({
    category: 'testability',
    description: `Only ${checklistCount} checklist items found. Need at least 3 concrete acceptance criteria.`,
    blocking: false,
  });
} else {
  result.gaps.push({
    category: 'testability',
    description: 'No checklist items (- [ ]) found in tasks.md. Acceptance criteria must be actionable.',
    blocking: true,
  });
}

// Check for Given/When/Then or executable commands
const hasGWT = /given|when|then/gi.test(tasksContent) || /```.*\n.*\n```/s.test(tasksContent);
if (hasGWT) {
  testabilityScore += 15;
} else {
  testabilityScore += 5;
  result.gaps.push({
    category: 'testability',
    description: 'Acceptance criteria lack executable format (Given/When/Then or code examples)',
    blocking: false,
  });
}

result.breakdown.testability = testabilityScore;

// 3. INTERFACES SCORING (15 pts)
let interfacesScore = 0;

// API endpoints/CLI args with types
const hasTypeDefinitions = /```typescript|```ts|```json|interface |type |:\s*\w+/i.test(contractsContent);
if (hasTypeDefinitions) {
  interfacesScore += 10;
} else {
  result.gaps.push({
    category: 'interfaces',
    description: 'No type definitions found (TypeScript/JSON schemas). API contracts need concrete types.',
    blocking: true,
  });
}

// Error handling specified
if (hasSection(contractsContent, 'Error', 'Exception', 'Failure')) {
  interfacesScore += 5;
} else {
  result.gaps.push({
    category: 'interfaces',
    description: 'Error handling not specified',
    blocking: false,
  });
}

result.breakdown.interfaces = interfacesScore;

// 4. CONSTRAINTS SCORING (15 pts)
let constraintsScore = 0;

// Non-Goals section non-empty
const nonGoalsSection = contractsContent.match(/#{1,3}\s+(Non-Goals|Out of Scope|Not Included)([\s\S]*?)(?=#{1,3}|$)/i);
if (nonGoalsSection && nonGoalsSection[2].trim().length > 50) {
  constraintsScore += 5;
} else {
  result.gaps.push({
    category: 'constraints',
    description: 'Non-Goals section is empty or too brief. Need explicit boundaries.',
    blocking: false,
  });
}

// Performance/security requirements mentioned
const hasRequirements = /performance|security|scalability|reliability|latency|throughput/gi.test(contractsContent);
if (hasRequirements) {
  constraintsScore += 5;
} else {
  result.gaps.push({
    category: 'constraints',
    description: 'No performance/security/scalability requirements mentioned',
    blocking: false,
  });
}

// Compatibility constraints listed
const hasCompatibility = /compatibility|version|deprecation|migration|backward|breaking/gi.test(contractsContent);
if (hasCompatibility) {
  constraintsScore += 5;
} else {
  result.gaps.push({
    category: 'constraints',
    description: 'No compatibility/migration/versioning constraints mentioned',
    blocking: false,
  });
}

result.breakdown.constraints = constraintsScore;

// 5. VERIFICATION SCORING (20 pts)
let verificationScore = 0;

// Regression test command specified
const hasTestCommand = /`(bun run test|npm test|yarn test|pytest|cargo test|go test)`/i.test(tasksContent) ||
                       /`(bun run test|npm test|yarn test|pytest|cargo test|go test)`/i.test(contractsContent);
if (hasTestCommand) {
  verificationScore += 10;
} else {
  result.gaps.push({
    category: 'verification',
    description: 'No regression test command specified (e.g., `bun run test`)',
    blocking: true,
  });
}

// Build/lint/test commands listed
const hasBuildCommands = /`(bun run check|bun run build|npm run build|make|cargo build)`/i.test(tasksContent) ||
                         /`(bun run check|bun run build|npm run build|make|cargo build)`/i.test(contractsContent);
if (hasBuildCommands) {
  verificationScore += 10;
} else {
  result.gaps.push({
    category: 'verification',
    description: 'No build/check commands specified',
    blocking: false,
  });
}

result.breakdown.verification = verificationScore;

// APPLY PENALTIES
const placeholders = hasPlaceholders(contractsContent + tasksContent);
if (placeholders.length > 0) {
  const points = placeholders.length * 5;
  result.penalties.push({
    reason: `Found ${placeholders.length} placeholder(s): ${placeholders.join(', ')}`,
    points,
  });
}

// Check for blocking "Open Questions"
if (hasSection(contractsContent, 'Open Questions', 'Questions', 'Unresolved')) {
  const questionsSection = contractsContent.match(/#{1,3}\s+(Open Questions|Questions|Unresolved)([\s\S]*?)(?=#{1,3}|$)/i);
  if (questionsSection && questionsSection[2].trim().length > 20) {
    result.penalties.push({
      reason: 'Open Questions section contains blocking items',
      points: 20,
    });
  }
}

// Check for missing "How to Verify" section
if (!hasSection(contractsContent, 'How to Verify', 'Verification', 'Testing', 'Test Plan') &&
    !hasSection(tasksContent, 'How to Verify', 'Verification', 'Testing', 'Test Plan')) {
  result.penalties.push({
    reason: 'No "How to Verify" or "Test Plan" section found',
    points: 15,
  });
}

// Calculate total
const penaltyTotal = result.penalties.reduce((sum, p) => sum + p.points, 0);
const rawScore = Object.values(result.breakdown).reduce((sum, score) => sum + score, 0);
result.total = Math.max(0, rawScore - penaltyTotal);

// Write result to file
writeFileSync(scoreOutputPath, JSON.stringify(result, null, 2));

// Output summary
console.log(`\nReadiness Score: ${result.total}/100`);
console.log('\nBreakdown:');
console.log(`  Structure:    ${result.breakdown.structure}/25`);
console.log(`  Testability:  ${result.breakdown.testability}/25`);
console.log(`  Interfaces:   ${result.breakdown.interfaces}/15`);
console.log(`  Constraints:  ${result.breakdown.constraints}/15`);
console.log(`  Verification: ${result.breakdown.verification}/20`);

if (result.penalties.length > 0) {
  console.log('\nPenalties:');
  result.penalties.forEach(p => {
    console.log(`  -${p.points} pts: ${p.reason}`);
  });
}

if (result.gaps.length > 0) {
  const blockingGaps = result.gaps.filter(g => g.blocking);
  const nonBlockingGaps = result.gaps.filter(g => !g.blocking);

  if (blockingGaps.length > 0) {
    console.log('\nBlocking Gaps:');
    blockingGaps.forEach(g => {
      console.log(`  [${g.category}] ${g.description}`);
    });
  }

  if (nonBlockingGaps.length > 0) {
    console.log('\nNon-Blocking Gaps:');
    nonBlockingGaps.forEach(g => {
      console.log(`  [${g.category}] ${g.description}`);
    });
  }
}

console.log(`\nScore saved to: ${scoreOutputPath}`);
console.log(`\nThreshold: ${threshold} | Status: ${result.total >= threshold ? 'PASS ✓' : 'FAIL ✗'}`);

// Exit with appropriate code
process.exit(result.total >= threshold ? 0 : 1);