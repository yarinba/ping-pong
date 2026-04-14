# E2B Validator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/validate` skill that commits + pushes the current branch, spins up an E2B sandbox with the full docker compose stack, runs a validator Claude Code instance inside it, and returns a structured pass/fail report.

**Architecture:** A Claude Code skill (`.claude/skills/validate.md`) orchestrates a Node.js script (`scripts/e2b-validate.mts`) that uses the E2B SDK to create a sandbox, clone the repo, start docker compose, run Claude Code headlessly with generated validation steps, parse the JSON report, and tear down the sandbox. The retry loop lives in the skill — the orchestrator always does exactly one run.

**Tech Stack:** E2B SDK (`e2b`), TypeScript ESM, tsx, vitest, Claude Code CLI (`claude --output-format json`), Docker Compose (inside E2B sandbox), Playwright (inside sandbox for UI checks)

---

### Task 1: Add env vars and install root dependencies

**Files:**
- Modify: `.env.example`
- Modify: `package.json`

**Step 1: Add required keys to .env.example**

Replace `.env.example` contents with:
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=hello_world

# E2B Validator
E2B_API_KEY=your_e2b_api_key_here
E2B_TEMPLATE_ID=your_template_id_after_build
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GITHUB_TOKEN=your_github_token_here
```

**Step 2: Add devDependencies and scripts to root package.json**

In `package.json`, update `devDependencies` and `scripts`:
```json
{
  "name": "ping-pong",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev:api": "pnpm --filter @ping-pong/api dev",
    "dev:worker": "pnpm --filter @ping-pong/worker dev",
    "dev:web": "pnpm --filter @ping-pong/web dev",
    "test": "pnpm -r test",
    "test:scripts": "vitest run scripts/"
  },
  "devDependencies": {
    "e2b": "latest",
    "tsx": "^4.19.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

**Step 3: Install**

```bash
pnpm install
```

Expected: lockfile updated, `e2b`, `tsx`, `vitest` visible in `node_modules/`.

**Step 4: Commit**

```bash
git add .env.example package.json pnpm-lock.yaml
git commit -m "chore: add e2b/tsx/vitest root deps for validator script"
```

---

### Task 2: Create TypeScript config for scripts

**Files:**
- Create: `scripts/tsconfig.json`

**Step 1: Create tsconfig**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["./**/*.ts", "./**/*.mts"]
}
```

**Step 2: Commit**

```bash
git add scripts/tsconfig.json
git commit -m "chore: add tsconfig for scripts directory"
```

---

### Task 3: Create E2B template files

**Files:**
- Create: `scripts/e2b-template/template.ts`
- Create: `scripts/e2b-template/build.ts`

**Step 1: Create template definition**

`scripts/e2b-template/template.ts`:
```ts
import { Template } from 'e2b'

export const template = Template()
  .fromTemplate('claude')
  .aptInstall([
    'docker.io',
    'docker-compose-plugin',
    'postgresql-client',
    'curl',
  ])
  .runCommands([
    // Install Temporal CLI
    'curl -sSf https://temporal.download/cli.sh | sh -s -- --install-dir /usr/local/bin',
  ])
  .npmInstall(['playwright'], { g: true })
  .runCommands(['playwright install chromium --with-deps'])
```

**Step 2: Create build script**

`scripts/e2b-template/build.ts`:
```ts
import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template.js'

await Template.build(template, 'ping-pong-validator', {
  cpuCount: 4,
  memoryMB: 8192,
  onBuildLogs: defaultBuildLogger(),
})
```

**Step 3: Commit**

```bash
git add scripts/e2b-template/
git commit -m "chore: add e2b template definition for validator sandbox"
```

---

### Task 4: Write failing tests for orchestrator pure functions

**Files:**
- Create: `scripts/e2b-validate.test.ts`

**Step 1: Write the tests**

`scripts/e2b-validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseArgs, buildPrompt, parseResult } from './e2b-validate.mjs'

describe('parseArgs', () => {
  it('parses required --prompt', () => {
    const result = parseArgs(['--prompt', 'check the API'])
    expect(result.prompt).toBe('check the API')
  })

  it('uses default retries of 2', () => {
    const result = parseArgs(['--prompt', 'check'])
    expect(result.retries).toBe(2)
  })

  it('parses custom --retries', () => {
    const result = parseArgs(['--prompt', 'check', '--retries', '3'])
    expect(result.retries).toBe(3)
  })

  it('parses --branch and --repo', () => {
    const result = parseArgs(['--prompt', 'x', '--branch', 'feat/foo', '--repo', 'https://github.com/org/repo.git'])
    expect(result.branch).toBe('feat/foo')
    expect(result.repo).toBe('https://github.com/org/repo.git')
  })

  it('throws if --prompt is missing', () => {
    expect(() => parseArgs([])).toThrow('--prompt is required')
  })
})

describe('buildPrompt', () => {
  it('includes the checks in the output', () => {
    const prompt = buildPrompt('1. GET /healthz → 200')
    expect(prompt).toContain('1. GET /healthz → 200')
  })

  it('includes all service URLs', () => {
    const prompt = buildPrompt('check')
    expect(prompt).toContain('localhost:3000')
    expect(prompt).toContain('localhost:5173')
    expect(prompt).toContain('localhost:5432')
  })

  it('instructs validator to output a JSON code block', () => {
    const prompt = buildPrompt('check')
    expect(prompt).toContain('```json')
    expect(prompt).toContain('"passed"')
  })
})

describe('parseResult', () => {
  it('returns passed=true when claude output-format json succeeds and report is valid', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: '```json\n{"passed":true,"checks":[{"name":"healthz","passed":true,"detail":"200 ok"}],"summary":"all good"}\n```',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(true)
    expect(result.checks).toHaveLength(1)
    expect(result.summary).toBe('all good')
  })

  it('returns passed=false when a check fails', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: '```json\n{"passed":false,"checks":[{"name":"UI","passed":false,"detail":"button not found"}],"summary":"UI check failed"}\n```',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(false)
    expect(result.summary).toContain('failed')
  })

  it('returns passed=false when claude exits with error', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'error_max_turns',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(false)
    expect(result.error).toContain('error_max_turns')
  })

  it('returns passed=false when stdout is not JSON', () => {
    const result = parseResult('not json')
    expect(result.passed).toBe(false)
    expect(result.error).toContain('invalid JSON')
  })

  it('returns passed=false when no JSON report block found', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'All looks good but no JSON block here.',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(false)
    expect(result.error).toContain('JSON report')
  })
})
```

**Step 2: Run tests to confirm they fail**

```bash
pnpm test:scripts
```

Expected: FAIL — "Cannot find module './e2b-validate.mjs'"

**Step 3: Commit the tests**

```bash
git add scripts/e2b-validate.test.ts
git commit -m "test: add failing tests for orchestrator pure functions"
```

---

### Task 5: Implement orchestrator with pure functions

**Files:**
- Create: `scripts/e2b-validate.mts`

**Step 1: Write the orchestrator**

`scripts/e2b-validate.mts`:
```ts
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
    // Clone repo
    await sandbox.git.clone(repo, {
      path: '/app',
      branch,
      username: 'x-access-token',
      password: GITHUB_TOKEN,
      depth: 1,
    })

    // Start Docker daemon
    await sandbox.commands.run('dockerd > /tmp/dockerd.log 2>&1 &')
    await sandbox.commands.run(
      'timeout 30 sh -c "until docker info > /dev/null 2>&1; do sleep 1; done"',
      { timeoutMs: 35_000 }
    )

    // Start stack
    await sandbox.commands.run('cd /app && docker compose up -d', { timeoutMs: 30_000 })

    // Wait for all healthchecks to pass (max 120s)
    await sandbox.commands.run(
      `timeout 120 sh -c 'until [ "$(cd /app && docker compose ps --format json | grep -c \\"healthy\\")" -ge 2 ]; do sleep 2; done'`,
      { timeoutMs: 130_000 }
    )

    // Run validator Claude
    const fullPrompt = buildPrompt(prompt)
    const result = await sandbox.commands.run(
      `cd /app && claude --dangerously-skip-permissions --output-format json -p ${JSON.stringify(fullPrompt)}`,
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
```

**Step 2: Run tests to verify they pass**

```bash
pnpm test:scripts
```

Expected: all tests PASS.

**Step 3: Commit**

```bash
git add scripts/e2b-validate.mts scripts/e2b-validate.test.ts
git commit -m "feat: add e2b validator orchestrator script"
```

---

### Task 6: Create the /validate skill

**Files:**
- Create: `.claude/skills/validate.md`

**Step 1: Use the skill-creator skill**

Invoke `example-skills:skill-creator` to create the skill. Provide the following spec:

**Skill name:** `validate`
**Trigger:** When Claude has finished implementing a feature and needs to verify the changes end-to-end.
**What it should do:**

1. Inspect the diff: run `git diff main...HEAD` and study what changed (routes, DB, worker, UI).
2. Generate a numbered list of concrete validation checks based on the diff — specific URLs, expected status codes, DB queries, UI interactions. Be explicit (e.g. "POST http://localhost:3000/pings → 201, body.status = pending").
3. Verify prerequisites: check that `E2B_API_KEY`, `E2B_TEMPLATE_ID`, `ANTHROPIC_API_KEY`, and `GITHUB_TOKEN` are set in the environment. If any are missing, stop and tell the user which keys to add to `.env`.
4. Commit and push: `git add -A && git commit -m "wip: changes for validation" && git push -u origin <current-branch>`.
5. Run the orchestrator: `npx tsx scripts/e2b-validate.mts --prompt "<generated checks>"`.
6. Parse the result:
   - If `passed: true` → report success to the user with the check summary.
   - If `passed: false` and retries remain → show the failed checks, fix the issues, commit + push, re-run the orchestrator. Default 2 retries.
   - If `passed: false` and no retries remain → report remaining failures to the user and stop.

**Step 2: Verify the skill file was created at `.claude/skills/validate.md`**

**Step 3: Commit**

```bash
git add .claude/skills/validate.md
git commit -m "feat: add /validate skill for e2b-powered end-to-end validation"
```

---

### Task 7: Build the E2B template

> This task runs once to register the sandbox template. It requires `E2B_API_KEY` set in your environment.

**Step 1: Load env**

```bash
export $(cat .env | grep -v '^#' | xargs)
```

**Step 2: Build the template**

```bash
npx tsx scripts/e2b-template/build.ts
```

Expected: build logs stream to terminal, ends with a template ID like `ping-pong-validator-abc123`.

**Step 3: Add template ID to .env**

In `.env`, set:
```
E2B_TEMPLATE_ID=<id from build output>
```

**Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: document E2B_TEMPLATE_ID in .env.example"
```

(Do not commit `.env` — it is gitignored.)

---

## Smoke Test

Once all tasks are complete:

1. Make a small change to the repo (e.g. add a comment to `apps/api/src/app.ts`)
2. Run `/validate` from Claude Code
3. Confirm: Claude generates checks → commits → pushes → sandbox runs → report returns

If the sandbox fails to start docker compose, check `docker compose logs` output captured in the error field of the report.
