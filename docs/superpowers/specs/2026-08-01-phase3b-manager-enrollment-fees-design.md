# Manager Dashboard — Enrollment Oversight and Fees — Design (Phase 3b)

## Status

Phase 3a shipped the academic scaffolding (Terms, Subjects, Sections, Routines, Exams) and is merged to `main` at 75 tests / 13 files. Phase 3b closes out the Manager role with the two areas 3a deferred: **enrollment oversight** and **fees and payments**.

This is the second half of the 3a/3b split recorded in the Phase 3a spec. After this phase the Manager role is feature-complete and the build moves to Phase 4 (Teacher grading) and Phase 5 (Student portal).

## Scope

**Enrollment oversight.** A Manager can see who is enrolled in a section and force-drop a student. Dropping is audited: the schema already carries `droppedAt` and `droppedBy` on `Enrollment`, and both must be written. Students enroll themselves in Phase 5; the Manager does not create enrollments here.

**Fees and payments.** A Manager can raise a `FeeItem` against a student for a term, and record `Payment` rows against it. `FeeItem.status` (`UNPAID` / `PARTIAL` / `PAID`) is **derived**, never typed in — it is recalculated from the sum of payments after every payment insert.

## Non-Goals

- **No student self-service.** Students see their own dues in Phase 5, not here.
- **No refunds or payment reversal.** A `Payment` row is append-only in this phase; correcting a mistake means a compensating process outside the app. Deleting payments is Phase 6 work if it is wanted at all.
- **No bulk fee generation.** Raising tuition for a whole cohort at once is a plausible feature and an explicit non-goal — one fee item per student per action keeps the write path simple and auditable.
- **No overpayment block.** Paying more than the outstanding balance is allowed and lands the item at `PAID`; the spec does not treat it as an error, because part-payments arriving out of order are normal.
- **No enrollment creation or re-enrollment.** Force-drop is one-way in this phase. A dropped student re-enrolling is Phase 5's problem, and the `@@unique([studentId, sectionId])` constraint means it will be an update, not an insert.
- **No schema changes.** Every field already exists from Phase 1.

## Architecture

Unchanged from Phases 2 and 3a. Server Components read Prisma directly; every mutation is a Server Action opening with `await requireRole(["MANAGER"])`; forms are plain `<form action={serverAction}>`; errors surface as a banner via `redirect("<page>?error=…")`. Fees list filters by term with the `?termId=` searchParam through the existing `resolveTermFilter` helper, defaulting to the active term.

## The Decimal Rule

`FeeItem.amount` and `Payment.amount` are Prisma `Decimal` columns. Phase 2 established, after a real corruption bug, that **decimals travel as strings from the form all the way into Prisma** — never through `z.coerce.number()`, because the round trip through a JS double silently rewrites `89.99` as `89.98999999999999`.

This phase is where that rule matters most: money. Concretely:

- Validation uses a `decimalString` field helper (regex-validated string), not `z.coerce.number()`.
- Prisma receives the validated string directly.
- Summing payments to derive status uses `Prisma.Decimal` arithmetic, **not** `Array.reduce` over `Number(...)`.
- Rendering uses `.toString()` on the Decimal.

The status recalculation is the one place a float would be most tempting and most damaging — a fee of 5000.00 paid in three parts must land exactly on `PAID`, not `PARTIAL` with a 0.0000000001 remainder.

## Pages

| Route | Purpose |
|-------|---------|
| `/manager/sections/[id]/enrollments` | Roster for one section; force-drop with audit |
| `/manager/fees` | Fee items filtered by term, with balance and status |
| `/manager/fees/new` | Raise a fee item against a student |
| `/manager/fees/[id]` | Fee item detail: payment history + record-a-payment form |

The section detail page from 3a gains a link to its roster. The Manager nav gains a single "Fees" entry — enrollments are reached through Sections, because a roster only makes sense in the context of a section.

## Status Recalculation

After each payment insert, inside the same transaction:

```
paid = sum(payments.amount for this feeItem)
status = PAID    if paid >= amount
         UNPAID  if paid == 0
         PARTIAL otherwise
```

The insert and the status update must be one `prisma.$transaction`, so a crash between them cannot leave a payment recorded against a stale status.

## Force-Drop Audit

`dropEnrollment(id, sectionId)` sets `status: DROPPED`, `droppedAt: new Date()`, and `droppedBy: session.user.id` — the id comes from the session returned by `requireRole`, never from the form. This is the Phase 2 lesson about client-controlled fields applied to an audit trail: a forged `droppedBy` would make the audit worse than useless.

Dropped enrollments stay visible on the roster, greyed, showing who dropped them and when. Nothing is deleted.

## Validation

- `feeItemSchema` — `studentId`, `termId`, `feeType` (`z.nativeEnum(FeeType)`), `amount` (decimal string, > 0), `dueDate` (date string).
- `paymentSchema` — `feeItemId`, `amount` (decimal string, > 0), `method` (`z.nativeEnum(PaymentMethod)`), `reference` (optional), `paidAt` (date string).
- `FeeItem.status` and `Payment.recordedBy` never appear in either schema — both are server-derived.

## Error Handling

Same banner pattern. FK violations on delete are not reachable here (nothing is deleted), so `isRestrictConstraintError` sees no new call sites. `isUniqueConstraintError` likewise: neither `FeeItem` nor `Payment` carries a unique constraint beyond its id.

The one genuinely new failure mode is recording a payment against a fee item that no longer exists, which surfaces as a friendly banner rather than an unhandled P2025.

## Testing

Unit tests for `feeItemSchema`, `paymentSchema`, and the status-derivation function — the last of which is pure and gets the most cases, including the exact-payoff case that a float implementation would fail. Manual end-to-end verification covers the force-drop audit fields and a three-part payment landing exactly on `PAID`.

## Dependencies and Follow-On

Consumes `requireRole`, `resolveTermFilter`, `parseDateInput`/`formatDateInput`, and the validation field helpers — all already on `main`. Phase 5's student dues view reads the `FeeItem.status` this phase computes, so the derivation being exact is a precondition for that phase being correct.

## Known Gap Carried Forward

Session invalidation, unchanged since Phase 2 and still unfixed: the JWT has no `maxAge` (30-day default) and the `jwt` callback never re-reads the database, so deactivating a user or resetting a password does not end an existing session. `isActive` is checked only in `authorize()` at login. This is worth fixing before any real deployment and is not in this phase's scope.
