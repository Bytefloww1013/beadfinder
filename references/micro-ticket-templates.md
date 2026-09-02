# Micro-Ticket Slicing Reference Guide

To ensure tickets fit comfortably in a single agent context window (100–250 lines of diff), use the following breakdown templates when running `/beadfinder-to-tickets`:

## Template: Decomposing a Backend Feature (e.g., "User Profile Avatar Upload")

Instead of a single ticket `"Build User Avatar Upload"`, create 6 linked micro-tickets:

1. **Task 1 (`bd-xxx.1`)**: Database Schema & Migration
   - *Target*: `migrations/20260831_add_avatar_url_to_users.sql`
   - *Scope*: Add `avatar_url` nullable column and index.
2. **Task 2 (`bd-xxx.2`)**: Storage Adapter Interface & S3 Mock
   - *Target*: `src/storage/avatar-storage.interface.ts`, `src/storage/mock-avatar-storage.ts`
   - *Scope*: Define `StorageClient` contract and in-memory mock for tests.
3. **Task 3 (`bd-xxx.3`)**: File Validation Service & Unit Tests
   - *Target*: `src/services/image-validator.service.ts`, `tests/unit/image-validator.test.ts`
   - *Scope*: Validate MIME types (JPEG/PNG/WebP), dimensions, and max file size (5MB).
4. **Task 4 (`bd-xxx.4`)**: Upload Route Handler & Auth Middleware
   - *Target*: `src/routes/user-avatar.route.ts`
   - *Scope*: Express/Fastify route handler parsing `multipart/form-data`.
5. **Task 5 (`bd-xxx.5`)**: Error Handling & Edge Case Suite
   - *Target*: `tests/integration/avatar-upload-errors.test.ts`
   - *Scope*: Test corrupted files, payload over 5MB, unauthenticated requests, S3 timeout handling.
6. **Task 6 (`bd-xxx.6`)**: End-to-End Integration Test
   - *Target*: `tests/e2e/avatar-upload.e2e.test.ts`
   - *Scope*: Full flow test from HTTP POST request to user record update verification.

## Dependency Chaining Command
Chain `blocks` only where the next task cannot start first. Independent tasks stay parallel — do not serialize the whole slice into a linked list:
```bash
bd dep add bd-xxx.2 bd-xxx.1 --type blocks
bd dep add bd-xxx.3 bd-xxx.2 --type blocks
bd dep add bd-xxx.4 bd-xxx.3 --type blocks
bd dep add bd-xxx.5 bd-xxx.4 --type blocks
bd dep add bd-xxx.6 bd-xxx.5 --type blocks
```

Every build bead carries `phase:implement` + `implementation` so `claim-next.sh` can route it to an `implementer` subagent. Review is per-bead through the phase pipeline (see `ARCHITECTURE.md`): `review-submit.sh` swaps `phase:implement` for `phase:review` during handoff, and downstream beads unblock when the reviewer closes a passed bead.

