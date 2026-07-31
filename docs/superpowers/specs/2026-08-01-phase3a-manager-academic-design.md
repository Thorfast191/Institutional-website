# Manager Dashboard — Academic Structure — Design (Phase 3a)

## Status

Approved by user 2026-08-01. Third of six incrementally-built phases. Phases 1
(schema, auth, RBAC, seed, shells) and 2 (Admin dashboard) are complete and
merged to `main`.

The Phase 2 spec described five phases. Manager's remit turned out to span seven
entity areas — nearly twice Phase 2's four, with three-FK entities, time-of-day
handling, and a derived status field — so Manager was split in two during
brainstorming. Phase 3a (this document) covers academic structure; Phase 3b
covers enrollment oversight and fees. That makes six phases: 3a, 3b, 4 (grade
computation), 5 (Student).

3a is deliberately first because Phase 4's teacher grading cannot exist until
Sections do.

## Scope

The Manager-owned academic scaffolding, per Phase 1's Role Permission Matrix:

- **Terms** — full CRUD, plus the registration window and the `isActive` flag.
- **Subjects** — full CRUD (`CSE101`-style code, credits, owning Program).
- **Sections** — full CRUD (Subject × Term × Teacher × label).
- **Routines** — full CRUD, the weekly recurring slots belonging to a Section.
- **Exams** — full CRUD, per Subject+Term, sequenced so a type can repeat.

## Non-Goals

- **No scheduling conflict detection.** A Manager may double-book a teacher or a
  room; overlapping Routines are allowed. Real timetables need deliberate
  exceptions, and this mirrors Phase 2's decision to skip cross-row overlap
  validation on Grade Scale bands.
- **No enrollment or fee screens.** Enrollment force-drop, FeeItems, and Payments
  are Phase 3b. Enrollments are *created* by student self-registration (Phase 5),
  so Manager never creates one.
- **No Admin UI for these entities.** The permission matrix grants Admin read
  access, but Phase 1 fixed "Admin's UI is scoped to `/admin` only in v1."
- **No schema changes.** Every field this phase touches already exists on `Term`,
  `Subject`, `Section`, `Routine`, and `Exam` from Phase 1.
- **No teacher account management.** Manager assigns teachers to Sections but
  cannot create or edit their User accounts — that stays Admin-only.

## Architecture

Unchanged from Phase 2:

- Server Components read Prisma directly; no REST/tRPC layer.
- Every mutation is a Server Action beginning with `await requireRole(["MANAGER"])`.
- Forms are plain `<form action={serverAction}>`; no client-side fetch.
- Errors surface as a banner via `redirect("<page>?error=<message>")`.
- All relations remain `Restrict`; no cascading deletes.

Only one Client Component is expected: the term switcher, and only if a plain
`<select>` wrapped in a `<form method="get">` proves insufficient. Prefer the
form — it needs no client JS.

## Pages

| Route | Contents |
|---|---|
| `/manager` | Overview cards: entity counts and the currently active term |
| `/manager/terms` | List / new / edit, plus **Set Active** |
| `/manager/subjects` | List / new / edit / delete; Program picker, credits |
| `/manager/sections` | List / new / edit / delete; filtered by term |
| `/manager/sections/[id]` | Section detail; weekly Routine slots managed inline |
| `/manager/exams` | List / new / edit / delete; filtered by term |

`/manager/sections` and `/manager/exams` default to the active term and accept
`?termId=<id>` to switch, reusing the searchParam-filter pattern already proven
by `?role=` on `/admin/users`. `?termId=all` shows every term.

The dashboard shell (`app/(dashboard)/layout.tsx`) gains a `MANAGER_NAV`
alongside Phase 2's `ADMIN_NAV`, keyed off `session.user.role` exactly as now.

## Set Active

Activating a term flips the chosen term's `isActive` to `true` and every other
term's to `false` inside a single `prisma.$transaction`. This enforces Phase 1's
"exactly one Term should have `isActive = true`" invariant structurally, so no
error state needs explaining and no window exists where zero terms are active.

`isActive` is therefore **not** an editable field on the term create/edit form.
It is changed only through the dedicated Set Active action.

## New Shared Building Blocks

### `lib/time.ts`

The one genuinely error-prone part of this phase. `Routine.startTime`/`endTime`
are `@db.Time` and `Exam.date` is `@db.Date`, but HTML inputs submit strings:
`<input type="time">` yields `"09:30"` and `<input type="date">` yields
`"2026-08-15"`. Prisma expects `Date` objects for both.

Every conversion goes through **UTC explicitly** — `"09:30"` becomes
`new Date("1970-01-01T09:30:00Z")` and is read back with `getUTCHours()`/
`getUTCMinutes()`. Parsing these as local time is precisely how off-by-one-hour
and off-by-one-day bugs enter, and the bug would be invisible to a developer in
UTC while corrupting data for everyone else.

```ts
export function parseTimeInput(value: string): Date;   // "09:30" -> 1970-01-01T09:30:00Z
export function formatTimeInput(value: Date): string;  // Date -> "09:30"
export function parseDateInput(value: string): Date;   // "2026-08-15" -> 2026-08-15T00:00:00Z
export function formatDateInput(value: Date): string;  // Date -> "2026-08-15"
```

Pure functions, unit tested for round-tripping and for midnight/noon boundaries.

### `lib/prisma-errors.ts`

A targeted cleanup of existing code. Phase 2 copy-pasted
`isUniqueConstraintError` and `isRestrictConstraintError` into three action files
(`departments.ts`, `programs.ts`, `users.ts`); Phase 3a would take that to eight.
Extract both once here and update Phase 2's three call sites to import them.

```ts
export function isUniqueConstraintError(error: unknown): boolean;   // P2002
export function isRestrictConstraintError(error: unknown): boolean; // P2003 | P2014
```

This is in-scope refactoring of code the phase actively touches, not unrelated
cleanup.

## Validation

One zod schema per entity in `lib/validation/`, mirroring Phase 2:

| Schema | Rules |
|---|---|
| `termSchema` | name required; `endDate` after `startDate`; `registrationClosesAt` after `registrationOpensAt` |
| `subjectSchema` | name, code required; `credits` an integer ≥ 1 |
| `sectionSchema` | `subjectId`, `termId`, `teacherId`, `label` all required |
| `routineSchema` | `sectionId`, `dayOfWeek` (enum), `room` required; `endTime` after `startTime` |
| `examSchema` | `subjectId`, `termId`, `examType` (enum), `date`, `room` required; `sequence` an integer ≥ 1; `endTime` after `startTime` |

Dates and times stay as their raw input strings through validation and are
converted via `lib/time.ts` at the Server Action boundary, immediately before the
Prisma call. Comparisons for the "after" rules operate on the parsed values.

No `Decimal` fields appear in this phase (`credits` is an `Int`), so Phase 2's
decimal-as-string rule does not apply here — but it will in 3b, for `FeeItem.amount`
and `Payment.amount`.

## Error Handling

Identical to Phase 2. A zod failure or a Prisma constraint violation redirects
back to the originating page with a human-readable banner:

- Duplicate `Subject.code` → "Subject code already in use."
- Duplicate `(subjectId, termId, label)` → "That section label already exists for this subject and term."
- Duplicate `(subjectId, termId, examType, sequence)` → "That exam already exists for this subject and term."
- Deleting a referenced row → "Cannot delete — one or more sections still reference this subject." (and the analogous messages for Term and Section)

## Testing

- **Unit (Vitest):** every zod schema above, plus `lib/time.ts` round-tripping.
- **End-to-end (Playwright):** the same manual pass Phase 2 received — create,
  edit, and delete each entity; deliberately trigger every FK-restrict and
  duplicate-key message; confirm Set Active leaves exactly one active term;
  confirm the term filter on Sections and Exams; and confirm a Manager still
  cannot reach `/admin` while an Admin still cannot reach `/manager`.

## Dependencies and Follow-On

3a unblocks:

- **Phase 4** (grade computation) — teachers grade the Enrollments hanging off
  the Sections created here.
- **Phase 5** (Student) — students self-register into these Sections during the
  registration window defined on the Term.

## Known Gap Carried Forward

Session invalidation, inherited from Phase 1 and unchanged by this phase:
sessions are JWT with no `maxAge` (next-auth's 30-day default) and the `jwt`
callback never re-reads the database, so deactivating a user or resetting their
password does not end their existing session — `isActive` is checked only in
`authorize()` at login. Out of scope for 3a; worth addressing in whichever phase
next touches auth.
