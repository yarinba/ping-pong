---
name: validate
description: Use this skill whenever you have finished implementing ANY code changes — features, bug fixes, refactors — and need to verify they actually work end-to-end. This skill spins up a fully isolated E2B sandbox with the complete application stack running (React UI, Fastify API, Temporal worker, Postgres), then uses Claude Code inside that sandbox to validate changes exactly like a real developer would: hitting API endpoints, querying the database, triggering Temporal workflows, and navigating the browser UI. Don't skip this just because the change seems small. Use it after completing any implementation task in this repo.
---

# /validate — E2B End-to-End Validator

You are about to validate your code changes in a clean, isolated E2B sandbox running the full application stack. Follow each step in order.

## Step 1: Understand what changed

Run `git diff main...HEAD` and read it carefully. Note which layers changed:
- API routes or middleware
- Worker logic or activities
- Database schema or queries
- UI components or interactions
- Shared types or utilities

This determines what you'll validate.

## Step 2: Write specific validation checks

Based on the diff, write a numbered list of concrete checks. Every check must have:
- **An exact action** (curl command, SQL query, browser interaction)
- **An exact expected result** (status code, field value, visible UI text)

**Good checks look like:**
```
1. GET http://localhost:3000/healthz → 200, body has ok=true
2. POST http://localhost:3000/pings → 201, body.status="pending", body.id is a UUID
3. Within 3 seconds: SELECT status FROM pings ORDER BY created_at DESC LIMIT 1 → "done"
4. Navigate to http://localhost:5173, click "Send Ping" button, verify "done" appears in the row
```

**Vague checks are useless** — "check the API works" tells the validator nothing. Be explicit about what URL, what payload, what response field, what DB column, what UI element.

## Step 3: Verify env prerequisites

Run:
```bash
echo "E2B_API_KEY=${E2B_API_KEY:-(MISSING)}"
echo "E2B_TEMPLATE_ID=${E2B_TEMPLATE_ID:-(MISSING)}"
echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-(MISSING)}"
echo "GITHUB_TOKEN=${GITHUB_TOKEN:-(MISSING)}"
```

If **any** show `(MISSING)`, stop immediately. Tell the user exactly which keys are missing and that they need to add them to `.env` (see `.env.example` for the full list). Do not proceed until all four are set.

## Step 4: Commit and push

Stage everything, commit, and push so the E2B sandbox can clone the branch:

```bash
git add -A
git commit -m "wip: changes for e2b validation"
git push -u origin $(git branch --show-current)
```

If the working tree is already clean (nothing to commit), skip the commit but still push if the remote is behind.

## Step 5: Run the orchestrator

Pass your numbered checks from Step 2 as the `--prompt` argument:

```bash
npx tsx scripts/e2b-validate.mts --prompt "1. GET http://localhost:3000/healthz → 200
2. POST http://localhost:3000/pings → 201, body.status=pending
3. Within 3s: last row in pings table has status=done
4. Navigate to http://localhost:5173, click Send Ping, verify done appears"
```

The orchestrator will:
1. Create an E2B sandbox using the pre-built template
2. Clone this repo at your current branch
3. Start docker compose and wait for all services to be healthy
4. Run Claude Code inside the sandbox with your checks as the validation prompt
5. Return a structured JSON report

**Expected runtime:** 3–8 minutes total (sandbox boot + docker compose startup + validation).

## Step 6: Handle the result

**If `"passed": true`:**
Report success to the user. Include the check summary from the report. You're done.

**If `"passed": false` — retry loop (default: 2 retries):**

1. Show the user which checks failed and exactly what was observed (from the `checks` array in the report)
2. Fix the code issues that caused the failures
3. Go back to Step 4 — commit, push, and re-run the orchestrator
4. Decrement your remaining retry count

Keep track: start with 2 retries. Each re-run consumes one.

**If retries are exhausted and still failing:**
Stop. Report to the user:
- Which checks passed
- Which checks still fail and what was observed
- What you tried in each retry

Don't silently loop forever. When you're out of retries, surface the problem.

## Stack reference

Services started by `docker compose up` inside the sandbox:

| Service | URL | Purpose |
|---------|-----|---------|
| Web (React) | http://localhost:5173 | Frontend UI |
| API (Fastify) | http://localhost:3000 | REST API |
| Temporal UI | http://localhost:8233 | Workflow dashboard |
| Temporal gRPC | localhost:7233 | Worker connection |
| Postgres | localhost:5432 | Database (user: postgres, pass: postgres, db: hello_world) |
