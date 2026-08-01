# Teacher Dashboard — Grading — Design (Phase 4)

## Status

Phases 1–3b are merged to `main` (100 tests / 16 files). Admin and Manager are feature-complete. Phase 4 builds the Teacher role: a teacher sees the sections they teach, opens a roster, and enters marks. Letter grade and grade point are **derived** from the `GradeScale` table, never typed in.

Phase 5 (Student portal) reads what this phase writes.

## Scope

- `/teacher` — overview: the teacher's own sections in the active term, with a graded/ungraded count.
- `/teacher/sections/[id]` — roster with a marks input per enrolled student, showing the derived letter grade and grade point for anyone already graded.
- Entering marks creates or updates that enrollment's `Grade` (the relation is 1:1 via `enrollmentId @unique`, so it is an upsert).

## The Ownership Rule

This is the phase's central risk. `requireRole(["TEACHER"])` proves *a* teacher is calling; it does not prove it is *this section's* teacher. Every read and every write must additionally check that the section belongs to the caller:

```
session.user.id → TeacherProfile.userId → TeacherProfile.id === Section.teacherId
```

For grading, the `enrollmentId` arrives from the form, so the check must walk `Enrollment → Section → teacherId` **server-side on every submit**. A teacher who forges another section's `enrollmentId` must be rejected, not silently allowed. This is the Phase 2 client-controlled-role lesson: never trust an id from the client to imply authorization.

A shared `requireOwnedSection(sectionId)` / `requireOwnedEnrollment(enrollmentId)` pair concentrates this in one place rather than repeating it per action.

## Grade Derivation

`marks` maps to a `GradeScale` band where `minMarks <= marks <= maxMarks`; that band supplies `letterGrade` and `gradePoint`, both stored on the `Grade` row.

Two consequences:

- **The Decimal rule applies.** `marks` and `gradePoint` are `Decimal` columns and travel as validated strings; the band comparison uses `Prisma.Decimal`, not JS numbers. This is precisely the lookup the Phase 2 corruption would have broken — a band ending at `89.98999999999999` leaves a mark of exactly `89.99` matching nothing.
- **A mark matching no band is an error, not a silent null.** `letterGrade` is non-nullable. If the scale has a gap, the teacher gets a banner saying so rather than an unhandled exception.

Marks are validated to 0–100.

## Non-Goals

- **No grade deletion.** Correcting a grade is re-entering the marks; the row is upserted.
- **No per-exam marks.** `Grade` holds one final mark per enrollment. Weighting quizzes and midterms into a final is not in the schema and is not invented here.
- **No teacher-managed enrollment.** Teachers cannot add or drop students; that is Manager (3b) and Student (5).
- **No grade visibility to students yet.** Phase 5 does that.
- **No schema changes.**

## Architecture

Unchanged. Server Components read Prisma directly; every Server Action opens with `requireRole(["TEACHER"])` followed by the ownership check; plain forms; errors as `redirect("<page>?error=…")` banners.

Dropped enrollments are shown but not gradeable — a dropped student has no grade to give.

## Validation

`gradeSchema` — `enrollmentId` (non-empty), `marks` (decimal string, 0–100). `letterGrade`, `gradePoint`, and `gradedBy` never appear: the first two are derived from the scale, the third from the session.

## Testing

Unit tests for `gradeSchema` and for the band-lookup function — the latter covering exact boundary values (a mark landing exactly on a band's `minMarks` and exactly on its `maxMarks`), the 89.99-style decimal case, and the no-matching-band case. Manual end-to-end verification covers the ownership check by attempting to grade another teacher's enrollment.

## Known Gap Carried Forward

Session invalidation, unchanged since Phase 2: the JWT has no `maxAge` and the `jwt` callback never re-reads the database, so deactivating a user does not end an existing session.
