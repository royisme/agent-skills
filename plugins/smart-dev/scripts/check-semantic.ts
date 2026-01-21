#!/usr/bin/env bun
/**
 * Semantic Sufficiency Check (Track B)
 *
 * Uses Claude API to verify semantic completeness of the specification.
 * Checks for ambiguity, unstated assumptions, and logical completeness.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx bun run check-semantic.ts --feature <feature-name>
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

interface SemanticCheck {
  ok: boolean;
  confidence: number;
  reason: string;
  evidence: Array<{
    claim: string;
    citation: string;
  }>;
  gaps: string[];
  last_updated: string;
  skipped?: boolean;
}

// Parse command line arguments
const args = process.argv.slice(2);
let featureName = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--feature' && i + 1 < args.length) {
    featureName = args[i + 1];
    i++;
  }
}

if (!featureName) {
  console.error('Usage: ANTHROPIC_API_KEY=xxx bun run check-semantic.ts --feature <feature-name>');
  process.exit(1);
}

const specDir = join('.works/spec', featureName);
const contractsPath = join(specDir, 'contracts.md');
const tasksPath = join(specDir, 'tasks.md');
const readmePath = join(specDir, 'README.md');
const outputPath = join(specDir, 'semantic-check.json');

// Check cache (5 min TTL)
const CACHE_TTL_MS = 5 * 60 * 1000;
if (existsSync(outputPath)) {
  const stats = statSync(outputPath);
  const age = Date.now() - stats.mtimeMs;

  if (age < CACHE_TTL_MS) {
    console.log('Using cached semantic check result (< 5 min old)');
    const cached = JSON.parse(readFileSync(outputPath, 'utf-8'));
    console.log(`\nSemantic Check: ${cached.ok ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`Confidence: ${cached.confidence}%`);
    console.log(`Reason: ${cached.reason}`);
    process.exit(cached.ok ? 0 : 1);
  }
}

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
const readmeContent = existsSync(readmePath) ? readFileSync(readmePath, 'utf-8') : '';

// Check for API key
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log('Warning: ANTHROPIC_API_KEY environment variable not set');
  console.log('Semantic check skipped - falling back to Track A only (degraded mode)');

  const fallbackResult: SemanticCheck = {
    ok: true,
    confidence: 0,
    reason: 'Semantic check skipped - API key not available (degraded mode: Track A only)',
    evidence: [],
    gaps: [],
    last_updated: new Date().toISOString(),
    skipped: true,
  };

  writeFileSync(outputPath, JSON.stringify(fallbackResult, null, 2));

  console.log(`\nSemantic Check: SKIPPED (degraded mode)`);
  console.log(`Reason: ${fallbackResult.reason}`);
  console.log(`Result saved to: ${outputPath}`);
  console.log('\nGate can still pass with Track A score alone.');

  process.exit(0);
}

// Prepare prompt for Claude
const prompt = `You are reviewing a feature specification for semantic sufficiency.

RUBRIC (must pass ALL):
1. Goal is unambiguous and measurable
2. Success criteria cover user intent (not just implementation details)
3. No implicit dependencies or hidden assumptions
4. Edge cases and error paths addressed
5. Rollback/migration strategy present (if needed for the feature)

For each criterion:
- Quote specific text from the spec as evidence (if present)
- If evidence missing, list as gap
- If ambiguous, explain why

SPECIFICATION FILES:

=== README.md ===
${readmeContent}

=== contracts.md ===
${contractsContent}

=== tasks.md ===
${tasksContent}

OUTPUT REQUIREMENTS:

Respond with ONLY a valid JSON object matching this schema:
{
  "ok": boolean,
  "confidence": number (0-100),
  "reason": string (one sentence summary),
  "evidence": [
    {
      "claim": string (which criterion this supports),
      "citation": string (exact quote from spec)
    }
  ],
  "gaps": string[] (missing information items)
}

CRITICAL: Only set ok=true if ALL 5 criteria have evidence.
If any criterion lacks evidence or is ambiguous, set ok=false and list gaps.

Do NOT include markdown formatting, code blocks, or explanatory text.
Output ONLY the JSON object.`;

console.log('Calling Claude API for semantic check...');

// Call Claude API
async function checkSemantic() {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',  // Fast and cost-effective
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const contentBlock = data.content[0];

    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response type from API');
    }

    const resultText = contentBlock.text.trim();

    // Try to parse JSON (handle potential markdown wrapping)
    let result: SemanticCheck;
    try {
      // Remove potential markdown code blocks
      const cleanJson = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      result = {
        ...parsed,
        last_updated: new Date().toISOString(),
      };
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', resultText);
      throw new Error('Claude returned invalid JSON');
    }

    // Save result
    writeFileSync(outputPath, JSON.stringify(result, null, 2));

    // Output summary
    console.log(`\nSemantic Check: ${result.ok ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Reason: ${result.reason}`);

    if (result.evidence.length > 0) {
      console.log('\nEvidence:');
      result.evidence.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.claim}`);
        console.log(`     Citation: "${e.citation.substring(0, 100)}..."`);
      });
    }

    if (result.gaps.length > 0) {
      console.log('\nGaps:');
      result.gaps.forEach(g => {
        console.log(`  - ${g}`);
      });
    }

    console.log(`\nResult saved to: ${outputPath}`);

    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error('Semantic check failed:', error);

    const errorResult: SemanticCheck = {
      ok: false,
      confidence: 0,
      reason: `API call failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence: [],
      gaps: ['Unable to perform semantic check due to API error'],
      last_updated: new Date().toISOString(),
    };

    writeFileSync(outputPath, JSON.stringify(errorResult, null, 2));
    process.exit(1);
  }
}

checkSemantic();
