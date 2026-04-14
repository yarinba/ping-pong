# Ding/Dong Feature Design

**Date:** 2026-04-14

## Summary

Add a "ding/dong" flow that mirrors ping/pong. A user clicks "Send Ding" in the UI, which calls `POST /dings`, which stores a `ding` record and triggers a Temporal workflow that responds with `dong`. The generalized workflow replaces the ping-specific one, and the list endpoint is renamed to `GET /messages` to reflect that it now serves both types.

## Decisions

- **Same table:** dings are stored in the existing `pings` table with `message='ding'`
- **Same list:** pings and dings appear interleaved in one UI list
- **Generalized workflow:** rather than duplicating the workflow, the existing `pingPongWorkflow` is replaced with `respondWorkflow(id, response)` that accepts the response value as a parameter

## Changes by Layer

### Shared (`packages/shared`)

- Replace `pingPongWorkflow(id: string)` with `respondWorkflow(id: string, response: string)`
- Replace `Activities.respondWithPong(id)` with `Activities.respondWithMessage(id: string, response: string)`
- Update exports accordingly

### Worker (`apps/worker`)

- Implement `respondWithMessage(id, response)`:
  ```sql
  UPDATE pings SET response = $2, status = 'done', responded_at = NOW() WHERE id = $1
  ```
- Remove `respondWithPong` implementation

### API (`apps/api`)

- `POST /pings` — unchanged externally; internally uses `respondWorkflow(id, 'pong')`
- `POST /dings` — new; inserts `message='ding'`, calls `respondWorkflow(id, 'dong')`
- `GET /messages` — replaces `GET /pings`; queries all rows from `pings` table

### Web (`apps/web`)

- Update poll URL from `/pings` to `/messages`
- Add "Send Ding" button that posts to `/dings`

## Validation Coverage

- `POST /pings` → `pong` still works end-to-end (regression)
- `POST /dings` → `dong` works end-to-end (new)
- `GET /messages` returns both types
