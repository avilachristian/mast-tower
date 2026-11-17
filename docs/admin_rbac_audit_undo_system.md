# Site Engineer and Admin Staff Access — Implementation Plan

**Version:** 2.0.0  
**Date:** November 17, 2026  
**Status:** Implemented locally; production migration and deployment have not been run.  
**Stack:** React, TypeScript, Zustand, Cloudflare Workers/Hono, D1, R2

## 1. Goal and scope

The Site Engineer owns the project and retains full application access. Separate admin staff accounts can work on manpower, hauling/inventory, reports, and payroll for projects assigned by the Site Engineer.

Keep a server-generated history of who changed records, what changed, and when. Undo, rollback, inverse mutations, and before/after project snapshots are outside this release.

Planning assumptions:

- Admin staff need data entry and editing, not just read-only reporting.
- The initial staff preset grants manpower/payroll and hauling/inventory access together. Either module can be removed when creating or editing an account.
- Reports mean manpower, payroll, and hauling/inventory reports. Construction activity, inspection, and daily site reports remain with the Site Engineer.
- Staff mutations require an online session in the first release. The Site Engineer's existing offline project workflow remains supported. Reliable offline operation attribution for staff is deferred.
- Existing payroll calculation and payment-status behavior is retained. This release does not introduce payroll approval stages or payment processing.

## 2. Roles and permissions

Use two roles: `super_admin` (Site Engineer) and `staff` (Admin Staff). Do not introduce manager/custom roles or a general-purpose role editor.

| Capability | Site Engineer | Admin Staff |
| --- | --- | --- |
| View projects | All | Assigned projects only |
| Worker and hauler roster | Full | View/add/edit with `manpower_payroll` |
| Attendance, wage rates, payroll records and payout status | Full | View/add/edit with `manpower_payroll` |
| Payroll preview, print and CSV export | Full | With `manpower_payroll` |
| Hauling trips, materials, inventory and hauling rates | Full | View/add/edit with `hauling_inventory` |
| Hauling/inventory report export and printing | Full | With `hauling_inventory` |
| Delete operational records | Full, subject to validation | No; request correction from Site Engineer |
| Construction activity, inspection and daily logs | Full | No |
| Project/report settings and client visibility | Full | Read only the metadata necessary for permitted reports |
| Create/delete/import/duplicate projects, full backups | Full | No |
| Accounts, permissions, project assignments | Full | No |
| Audit history and storage administration | Full | No |

`StaffPermission = 'manpower_payroll' | 'hauling_inventory'`.

Shared dependencies: either module may read the minimal hauler identity list needed to select a hauler. Manpower/payroll may read hauling entries and rate configuration needed to calculate hauler payroll, even when hauling editing is disabled. Hauling-only access must not expose civil wage rates, attendance, payroll history, or payout details. Hauling rate edits require `hauling_inventory`, including controls rendered inside payroll screens. Document these dependencies in DTO and policy tests.

Staff never receive `*`, `accounts`, `audit`, or a client-controlled role upgrade. All policies are enforced by the Worker. Navigation filtering is a usability layer.

## 3. Existing code and implementation approach

- `worker/auth.ts`: password hashing, cookie sessions, initial account seeding; extend existing mechanisms.
- `worker/index.ts`: existing protected project routes return/save complete project records; keep them for the Site Engineer and reject staff access.
- `src/shared/api/client.ts`, `src/shared/state/authStore.ts`: extend session DTOs with role, permissions, and assigned project IDs.
- `src/shared/state/projectStore.ts`, `src/shared/storage/cloudSync.ts`: existing full-project persistence and sync remain an owner workflow. Never insert a partial staff DTO into `SavedProjectRecord` or send it through full-project sync.
- `src/widgets/manpower/*`, `src/widgets/hauling/*`: reuse calculations and UI where practical; refactor data/mutation access behind a workspace adapter instead of duplicating business rules.
- `src/entities/project/types.ts`: use existing operational fields, with separate typed staff DTOs rather than a pretend complete `MastProjectState`.

D1 can continue storing the project in `state_json`. Staff requests send specific commands or record patches; the Worker loads the current project and applies only permitted changes. Normalizing every project record into new SQL tables is not required for this release.

## 4. Phase 1 — Database migration and account lifecycle

Create the next available migration (currently `0003_staff_access_and_audit.sql`, after checking migration numbering).

Add to `admin_users`:

- `role`, constrained to `super_admin` or `staff`, default `staff`.
- `permissions_json`, default `[]`, validated by the API against the two supported permission keys.
- `is_active`, constrained to 0/1, default 1.
- `created_by` for account provenance.

Add `admin_user_projects(user_id, project_id)` with a composite primary key and foreign keys to users/projects. Assignments are mandatory for staff project access.

Migration/bootstrap requirements:

1. Explicitly identify and promote the existing Site Engineer account; never promote every account automatically. If only one existing account is present, promote that account. If there are multiple accounts, designate the owner by the configured username and stop rollout if it cannot be resolved unambiguously.
2. Update `ensureSeededAdminUser` so a newly initialized database creates a `super_admin` explicitly.
3. Retain existing project data and owner access. Do not seed inventory/payroll permissions onto all existing accounts.
4. Protect the owner from deactivation, deletion, or demotion through account APIs.
5. Normalize usernames and enforce case-insensitive uniqueness at the database level after checking for existing duplicates.
6. Deactivate accounts instead of hard deleting them. Password resets and deactivation revoke their sessions; authorization reads current role, active status, permissions, and assignments on every request.

Deliverable: the Site Engineer remains able to sign in, and staff accounts can be created, assigned, updated, and deactivated safely.

## 5. Phase 2 — Server authorization and scoped APIs

Introduce a shared policy module used by Worker routes and matching frontend helpers. Deny unknown permission keys and unauthorized fields by default.

Proposed endpoints:

| Endpoint | Policy / behavior |
| --- | --- |
| `GET/POST /api/admin/users` | Site Engineer only; list/create accounts |
| `PATCH /api/admin/users/:id` | Site Engineer only; name, permissions, assignments, active status |
| `POST /api/admin/users/:id/reset-password` | Site Engineer only; reset password and revoke sessions |
| `GET /api/admin/staff/projects` | Only assigned projects; minimal summary fields |
| `GET /api/admin/staff/projects/:id/workspace` | Permission-filtered operational data and report metadata |
| `POST /api/admin/staff/projects/:id/commands` | Validated operation, current project assignment and module permission required |
| `GET /api/admin/audit` | Site Engineer only; paginated filters |
| `GET /api/admin/audit/:id` | Site Engineer only; redacted field diff details |

Command contract: `{ operationId, expectedVersion, type, payload }`. Define a discriminated TypeScript union and runtime validation for supported commands: roster create/update, attendance update, payroll snapshot create/status update, hauler payout create/update, hauling trip create/update, material create/update, and hauling rate update. No generic JSON paths or arbitrary project slice replacement.

Each successful command:

1. Authenticates the current account and checks active status, assignment and command permission.
2. Validates payload fields, entity existence, references, dates, amounts and existing domain rules.
3. Loads authoritative project state, applies the command to allowed records and computes field diffs server-side.
4. Updates using `WHERE id = ? AND version = ?`, increments the version, and couples the write and audit insert atomically. Audit insertion must be conditional on the matching write succeeding; a zero-row update is a conflict, not a successful command.
5. Returns a permission-filtered workspace response and its new version. Conflict responses must also omit restricted project data.

Use unique operation IDs scoped to the actor for retry deduplication; retries of the same operation must not add another trip, payout, payroll snapshot, or audit event. Reject reuse with a different payload. Define how successful result/version metadata is retained and replayed.

Return `401` for unauthenticated requests, `403` for prohibited capabilities, `404` for inaccessible/unassigned projects, and `409` for version or record conflicts. Staff cannot force overwrite or upsert an unassigned project.

Review all existing routes, including full project GET/list/PUT/POST/DELETE, visibility, image upload/delete, storage and reconciliation. Reject staff access unless an explicit allowed use is documented. General media administration remains owner-only; resolve report assets through narrowly scoped read access. Review existing public image delivery before claiming private report/signature assets are protected.

Allowlist report metadata such as project name, location, contractor, letterhead and signatory labels/assets that permitted reports actually need. Do not return all `reportDetails` automatically. Report preparation must not rewrite project-level prepared-by or signatory settings.

Deliverable: staff can perform allowed work through the API, but cannot retrieve or change construction data or unrelated projects.

## 6. Phase 3 — Staff workspace and reports

1. Route sign-in according to role. Keep the Site Engineer's full workspace; show staff only permitted Manpower/Payroll and Hauling/Inventory tabs plus assigned project selection.
2. Add a scoped staff store/API adapter. Refactor shared widgets to accept authorized data and mutation actions; do not run owner project hydration, cloud sync, backup/import, global project search or force-overwrite controls for staff.
3. Gate direct URLs, header shortcuts, report launchers, cross-module links and action buttons, including delete actions and rate controls inside payroll.
4. Reuse existing payroll calculations, CSV exports and print layouts. Supply only approved report context and module data. Add a hauling/inventory print/export path if the existing workspace lacks one.
5. Save staff commands immediately with visible saving/saved/error state. Update UI from the acknowledged server result. Do not label failed submissions as saved.
6. On `409`, preserve the unsent form, fetch permitted current data, and ask the user to review/resubmit. Do not silently merge payroll amounts or overwrite the owner's work.
7. On session expiry, deactivation or revoked access, stop mutations and clear restricted in-memory data. Isolate account caches; staff must never hydrate the owner's IndexedDB project records or pending uploads. Clear active project state during account switches and rehydrate from the new account's authorized source.
8. Staff offline behavior: disable server mutations and show a connection message. Do not create a persistent staff project/offline queue in this release. Data already downloaded or printed cannot be remotely revoked; do not describe client caches as a security boundary.

Deliverable: a staff member can complete manpower, hauling and payroll/report tasks without navigating the engineering workspace.

## 7. Phase 4 — Audit history

Create append-only `audit_logs` with:

- ID, nullable project ID, authenticated actor ID and actor name at the time.
- Domain, action, entity type/ID, server-generated summary.
- Field-level `diff_json` with old/new values for permitted business fields.
- Server timestamp, operation/request ID, and project version before/after where applicable.

Index by project/date/ID and actor/date/ID. Use cursor pagination with bounded page size. Keep actor identity snapshots so deactivation does not erase attribution. Record account permission and project-assignment changes without credential values.

Rules:

- The server derives actor identity, previous values, accepted values and timestamp. Never trust client `modifiedBy` or client-authored summaries as official history.
- Audit owner writes as well as staff commands: operational changes, owner deletions, project metadata/visibility changes, project creation/deletion, and account changes. Owner full-project sync generates entity-level diffs by stable IDs; multiple diff rows may share one request ID.
- An owner sync represents changes accepted at sync time, attributed to the authenticated uploader. It does not prove the timing or author of every intermediate offline edit. State this limitation in the history UI.
- Commit account/project mutations with their audit events atomically. If audit persistence fails, do not report the mutation as successful.
- Never log passwords, password hashes, cookie tokens, session hashes, or raw image data. Password reset events record only that a reset occurred.
- Keep audit events available after project deletion; do not cascade-delete them. No application route edits or deletes historical events.
- Do not store whole project snapshots or add undo fields/endpoints. An audit entry is evidence, not a rollback payload.

Add an owner-only Audit History view with project, actor, domain and date filters, record summaries, and field details. Initial retention: no application auto-purge; document D1 growth and revisit retention once actual usage is known.

For owner project writes, preserve existing media linking, client DTO generation and cache invalidation. Staff commands must use the same derived-data update path when affected fields appear in public projections. Do not create a second inconsistent save implementation.

## 8. Phase 5 — Verification and rollout

Extend existing tests instead of replacing established calculation coverage.

Automated checks:

- Migration preserves project data and correctly provisions/designates the owner on existing and fresh databases.
- Owner protection, case-insensitive usernames, session revocation, inactive users and current permission changes.
- Staff cannot self-promote, grant permissions, access another project, call full-state endpoints, use storage/media administration, or retrieve restricted fields via success/error/conflict responses.
- Hauling-only responses exclude payroll data; payroll-only dependencies are readable without granting hauling writes.
- Commands reject extra fields, invalid references, negative/invalid amounts as appropriate, and staff deletion attempts.
- Concurrent writes produce a conflict without losing unrelated project data. Failed writes produce no audit entries; failed audit inserts leave business state unchanged.
- Duplicate operations do not duplicate records/audits; same ID with altered payload is rejected.
- Both owner and staff changes generate correct field diffs and authenticated attribution. Audit survives project deletion and excludes secrets.
- Account switching cannot upload an owner's pending work under a staff account. Staff never use force overwrite or full-project background sync.
- Existing payroll totals, hauling credits, report output, owner offline sync, public projections and cache invalidation continue working.

Primary test files: `tests/workerApi.test.ts`, `tests/manpowerPayroll.test.ts`, `tests/payrollReport.test.ts`, `tests/payrollCsvExport.test.ts`, `tests/cloudSyncScheduler.test.ts`, and `tests/clientProjection.test.ts`; add focused policy and staff-store tests as needed.

Manual acceptance walkthrough:

1. Sign in as the Site Engineer; confirm existing projects and full access remain intact.
2. Create one Admin Staff account, assign this project and both modules.
3. Sign in as staff; record manpower attendance, prepare/print/export civil and hauler payroll, and add/edit a hauling trip.
4. Confirm staff cannot open engineering views, delete operational records, change client visibility, edit accounts or export a full project backup.
5. Confirm updates appear for the Site Engineer and in Audit History with the correct actor and field changes.
6. Remove one module, remove project assignment, and deactivate the account; verify server access changes immediately on the next request.
7. Exercise simultaneous owner/staff edits, interrupted requests/retries, offline staff use and switching accounts on the same browser.

Run `npm test` and `npm run build`. Rehearse migration and deployment against a local database and a staging copy before production. Back up D1 before production migration. Deploy schema first, then the Worker authorization/API, then frontend access; keep staff accounts inactive until the complete path passes acceptance checks. Rollback must disable staff access before reverting to any Worker version that lacks role enforcement.

## 9. Completion criteria and sequence

Implementation order: database/account lifecycle -> server policies and scoped commands -> staff workspace/reports -> audit view and complete write coverage -> verification/rollout. Audit storage and atomic write support must be built with command processing, not bolted on after writes ship.

The release is complete when the Site Engineer retains full control, assigned staff can prepare manpower/hauling reports and payroll, restricted data stays out of staff API responses, concurrent work does not overwrite unrelated records, and accepted changes have an attributable history.

Deferred: undo/rollback, custom role builders, staff offline command synchronization, payroll approval workflows, and cross-project administrative dashboards.


## 10. Implementation and release notes

Implemented entry points:

- `src/app/AccountAuditPanel.tsx`: Site Engineer account management, assignments, password reset, deactivation, and audit filters/details.
- `src/app/StaffWorkspace.tsx`: dedicated staff workspace, attendance, roster, payroll generation/history/printing/CSV, payouts, hauling records, material inventory and rates.
- `worker/accessRoutes.ts` and `worker/staffDomain.ts`: scoped DTOs, assignment/permission checks, runtime command validation and server payroll calculations.
- `worker/audit.ts`: authenticated diffs and audit inserts coupled to database writes; owner saves and staff commands both produce history.
- `migrations/0003_staff_access_and_audit.sql`: role/account fields, assignments, append-only audit and retry receipts.
- `tests/staffAccess.test.ts` and `tests/helpers/d1.ts`: real SQLite coverage of role boundaries, rollback, deduplication, payroll settlement and account transitions.

Operational details:

1. Back up the database and inspect existing account usernames before applying migration 0003. A single existing account becomes the owner. For multiple accounts, the first login can designate the configured `ADMIN_USERNAME` only when no owner exists. If that username does not match the intended existing owner, explicitly designate the correct owner in the database before enabling staff access. Do not invent a new owner password for an existing account: its current hash is preserved.
2. Run `npm run db:migrate:local` for the normal development database, then `npm run dev:api` and `npm run dev`. Verification during implementation used an isolated QA database instead of changing the normal development or production databases.
3. Production requires the existing `npm run db:migrate:remote` followed by the normal deployment workflow after database backup and staging acceptance. These commands have not been run by the implementation task.
4. Sign in as the Site Engineer and open **Team accounts**. Create a staff login, select modules and explicitly assign projects. Staff sign in at the same admin URL and automatically receive the restricted workspace.
5. Staff save immediately online. On version conflicts, **Refresh project**, review the preserved form, then resubmit. After an uncertain network response, **Retry save** resubmits the same operation ID. Staff have no persistent offline edit queue or operational delete controls.
6. Hauling entry forms operate on one material record at a time. Trip numbers follow the existing 1/2 model. Changing the date, hauler or trip number of an existing multi-material grouped trip requires the Site Engineer's existing grouped-trip editor to preserve group consistency.
7. Inventory usage is aggregated on the server; staff do not receive daily-log records. Payroll print components now accept scoped report context, without manufacturing a partial full-project record.
8. Existing URL-based public R2 image delivery is unchanged. This release restricts administrative media APIs and project responses; it does not introduce private-asset access control or revoke previously downloaded assets.
9. D1 audit history is append-only through database triggers. D1 administrators still control the database; this is application history, not an externally signed forensic ledger. No automatic retention purge is configured.
10. Tests use Node's built-in SQLite API (Node 24 was used for verification). The browser smoke test used sample-only records in a local Worker with local D1 and local R2.
