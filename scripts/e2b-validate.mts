import { Sandbox } from 'e2b'
import { execSync } from 'node:child_process'

// ─── Pure functions (unit-tested) ────────────────────────────────────────────

export interface ParsedArgs {
  prompt: string
  retries: number
  branch: string
  repo: string
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      args[key] = argv[i + 1] ?? ''
      i++
    }
  }
  if (!args.prompt) throw new Error('--prompt is required')
  return {
    prompt: args.prompt,
    retries: args.retries ? parseInt(args.retries, 10) : 2,
    branch: args.branch ?? '',
    repo: args.repo ?? '',
  }
}

export function buildPrompt(checks: string): string {
  return `You are a validator running inside an E2B sandbox.
The following services are running via docker compose and are already healthy:
- Web (React): http://localhost:5173
- API (Fastify): http://localhost:3000
- Temporal UI: http://localhost:8233
- Postgres: localhost:5432 (user: postgres, pass: postgres, db: hello_world)

Available tools: curl, psql, temporal CLI, Node.js.
For UI checks: write a small Playwright script, run it with node, read the output.

For each check below: run it, record pass/fail and the exact result observed.

${checks}

After all checks, output your final report as a JSON code block exactly like this:
\`\`\`json
{
  "passed": <true if ALL checks passed, false otherwise>,
  "checks": [
    {"name": "<check name>", "passed": <bool>, "detail": "<what you observed>"}
  ],
  "summary": "<one paragraph summary>"
}
\`\`\``
}

export interface ValidationResult {
  passed: boolean
  checks?: Array<{ name: string; passed: boolean; detail: string }>
  summary?: string
  error?: string
  raw?: string
}

export function parseResult(stdout: string): ValidationResult {
  let outer: Record<string, unknown>
  try {
    outer = JSON.parse(stdout)
  } catch {
    return { passed: false, error: 'orchestrator: invalid JSON from claude', raw: stdout.slice(0, 500) }
  }

  if (outer.type !== 'result' || outer.subtype !== 'success') {
    return { passed: false, error: `claude exited with: ${String(outer.subtype ?? 'unknown')}`, raw: stdout.slice(0, 500) }
  }

  const text = String(outer.result ?? '')
  const match = text.match(/```json\s*([\s\S]+?)\s*```/)
  if (!match) {
    return { passed: false, error: 'validator did not output a JSON report', raw: text.slice(0, 500) }
  }

  try {
    const report = JSON.parse(match[1]) as ValidationResult
    return {
      passed: report.passed === true,
      checks: report.checks,
      summary: report.summary,
    }
  } catch {
    return { passed: false, error: 'failed to parse validator JSON report', raw: match[1].slice(0, 500) }
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const { prompt, branch: argBranch, repo: argRepo } = parseArgs(argv)

  const branch = argBranch || execSync('git branch --show-current').toString().trim()
  const repo = argRepo || execSync('git remote get-url origin').toString().trim()

  const E2B_API_KEY = process.env.E2B_API_KEY
  const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN

  if (!E2B_API_KEY) throw new Error('E2B_API_KEY is required')
  if (!E2B_TEMPLATE_ID) throw new Error('E2B_TEMPLATE_ID is required')
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required')
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required')

  const sandbox = await Sandbox.create(E2B_TEMPLATE_ID, {
    envs: { ANTHROPIC_API_KEY, GITHUB_TOKEN },
    timeoutMs: 600_000,
  })

  try {
    // Clone repo into user-owned directory to avoid safe.directory issues
    await sandbox.git.clone(repo, {
      path: '/home/user/app',
      branch,
      username: 'x-access-token',
      password: GITHUB_TOKEN,
      depth: 1,
    })

    // Docker daemon is pre-running in the template; user needs sudo to access it
    // Start stack (builds api/worker/web images on first run)
    await sandbox.commands.run('cd /home/user/app && sudo docker compose up -d', { timeoutMs: 600_000 })

    // Wait for postgres and temporal healthchecks to pass (max 180s)
    await sandbox.commands.run(
      `timeout 180 sh -c 'until [ "$(cd /home/user/app && sudo docker compose ps --format json | grep -c \\"healthy\\")" -ge 2 ]; do sleep 2; done'`,
      { timeoutMs: 200_000 }
    )

    // Run validator Claude
    const fullPrompt = buildPrompt(prompt)
    const result = await sandbox.commands.run(
      `cd /home/user/app && claude --dangerously-skip-permissions --output-format json -p ${JSON.stringify(fullPrompt)}`,
      { timeoutMs: 300_000 }
    )

    const report = parseResult(result.stdout)
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.passed ? 0 : 1)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.log(JSON.stringify({ passed: false, error }))
    process.exit(1)
  } finally {
    await sandbox.kill()
  }
}

// Only run main when this file is executed directly (not imported in tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
