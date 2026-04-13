# ping-pong

Tiny monorepo demo: a React client triggers a Temporal workflow through a Fastify API; a worker process executes the workflow and writes the result to Postgres.

## Quickstart

```bash
git clone <this-repo>
cd ping-pong
docker compose up
```

That's it. No host-side `pnpm install`, no Postgres install, no Temporal CLI install.

Then open:

| URL                         | What                |
|-----------------------------|---------------------|
| http://localhost:5173       | Web client          |
| http://localhost:3000/healthz | API health        |
| http://localhost:8233       | Temporal Web UI     |

Click **Send Ping** in the web client and watch the row update from `pending` → `done`.

## Ports

| Service   | Port  |
|-----------|-------|
| web       | 5173  |
| api       | 3000  |
| temporal  | 7233 (gRPC), 8233 (UI) |
| postgres  | 5432  |

## Make targets

- `make up` — start the stack
- `make down` — stop the stack
- `make reset` — wipe volumes and restart (resets the DB)
- `make logs` — tail logs
- `make build` — rebuild images

## Troubleshooting

- **"port already in use"** — something on the host is using 5173/3000/5432/7233/8233. Stop it or change the port mapping in `docker-compose.yml`.
- **DB looks stale** — `make reset` wipes the Postgres volume.
- **Worker can't connect to Temporal** — wait a few seconds; the worker retries 5 times with backoff. If it still fails, check `docker compose logs temporal`.
- **Code change didn't reload** — `tsx watch` and `vite` reload on save. If a new file isn't picked up, restart the affected service: `docker compose restart api` (or `worker`, `web`).
- **Want to run tests?** `pnpm install` once on the host, then `pnpm -r test`.
