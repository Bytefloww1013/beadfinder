# The 10 Architectural Pillars: Decision Taxonomy Reference

Use this reference to ensure exhaustive decision mapping during `/beadfinder` sessions.

| Pillar | Focus Areas & Questions to Map | Example Decision Bead Titles |
| :--- | :--- | :--- |
| **1. Domain & Entity Modeling** | Entity relationships, primary keys, state machines, validation rules. | `Decision: Should OrderStatus use an explicit state machine or string enums?` |
| **2. Data Persistence & Storage** | DB engine, index strategy, JSON columns vs relational tables, soft deletes. | `Decision: Indexing strategy for high-frequency user event logs` |
| **3. Interface & Contracts** | Protocol, request/response wrappers, payload validation schemas. | `Decision: Use Zod schemas vs JSON Schema for runtime API validation` |
| **4. Auth & Permissions** | Token format (JWT vs session cookies), expiry, RBAC permission matrix. | `Decision: Should RBAC be evaluated in API gateway or service middleware?` |
| **5. Concurrency & Mutations** | Idempotency keys, optimistic vs pessimistic locking, race conditions. | `Decision: Idempotency deduplication mechanism for webhook ingest` |
| **6. Error Topography** | Standardized error payload, HTTP status code mapping, circuit breakers. | `Decision: Standard error payload envelope and domain error taxonomy` |
| **7. External Integrations** | API clients, webhook signature verification, mock adapters for dev. | `Decision: Mock adapter strategy for Stripe billing in local test suite` |
| **8. Performance & Budgets** | Caching layer (Redis vs in-memory), pagination style (cursor vs offset). | `Decision: Cursor-based vs offset-based pagination for activity feed` |
| **9. Observability & Telemetry** | Structured log keys, OpenTelemetry tracing seams, Prometheus metrics. | `Decision: OpenTelemetry span context propagation across worker queues` |
| **10. Migrations & Seeding** | DB migration tool, zero-downtime column rollout, seed data fixtures. | `Decision: Zero-downtime migration strategy for renaming user table columns` |
