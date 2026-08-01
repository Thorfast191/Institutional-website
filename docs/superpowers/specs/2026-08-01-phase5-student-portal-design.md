# Student Portal — Design (Phase 5)

## Status

Phases 1–4 are merged to `main` (114 tests / 18 files). Admin, Manager, and Teacher are feature-complete. Phase 5 builds the Student role and closes the build: a student registers for sections inside the term's registration window and sees their own courses, grades, weekly routine, exam schedule, and dues.

Everything here is read-only except registration. Every screen reads what earlier phases wrote — grades from Phase 4, fee status from Phase 3b, routines and exams from Phase 3a.

## Scope

| Route | Purpose |
|-------|---------|
| `/student` | Overview: active term, registration window state, counts, GPA |
| `/student/register` | Available sections in the active term; enroll / drop inside the window |
| `/student/courses` | Enrolled sections with marks, letter grade, grade point |
| `/student/routine` | Weekly schedule assembled from enrolled sections' routine slots |
| `/student/exams` | Exams for the subjects the student is enrolled in, this term |
| `/student/dues` | Fee items with amount, paid, outstanding, and status |

## The Two Rules

**Own data only.** `session.user.id → StudentProfile.userId → StudentProfile.id`, and every query filters on that id. No page takes a student id from the URL or a form. This is the Phase 4 ownership rule applied to a role where the temptation to pass ids around is highest, because a student's whole portal is "their own rows".

**The registration window is enforced server-side.** `Term.registrationOpensAt <= now <= Term.registrationClosesAt` on the **active** term. The register page hides the buttons when the window is shut, and the Server Action re-checks — the UI state is a convenience, never the control. A student submitting a stale form after the window closes is rejected.

## Registration

Enrolling creates an `Enrollment` with `status: ENROLLED`. Because `@@unique([studentId, sectionId])` already exists, a student who previously dropped and re-enrolls **updates** the existing row back to `ENROLLED` and clears `droppedAt`/`droppedBy` — an insert would violate the constraint. Registration is therefore an upsert, exactly as grading is.

Self-drop is the counterpart and is allowed inside the same window; it writes the same audit fields the Manager's force-drop writes, with `droppedBy` set to the student's own user id. Outside the window a student cannot drop — only a Manager can, via Phase 3b.

A section already full has no capacity concept in the schema, so **no capacity limit is enforced**. Noted as a non-goal rather than invented.

## GPA

The overview shows a GPA across graded enrollments in the active term: the credit-weighted mean of `gradePoint`, weighted by `Subject.credits`, computed with `Prisma.Decimal` and rounded to two places for display only. Ungraded enrollments are excluded rather than counted as zero. With no graded enrollments the page shows "—", not `0.00`.

The Decimal rule applies: the weighting arithmetic is Decimal throughout, and only the final `.toFixed(2)` produces a string for display.

## Non-Goals

- **No payment by students.** Dues are read-only; recording payments stays with the Manager (Phase 3b).
- **No capacity or prerequisite checks.** Neither exists in the schema.
- **No transcript across terms.** Courses and GPA are per-term with a term filter; a formal transcript document is out of scope.
- **No profile editing.** Students cannot change their own name, email, or program.
- **No schema changes.**

## Architecture

Unchanged. Server Components read Prisma directly; the two Server Actions (`enrollInSection`, `dropOwnEnrollment`) open with `requireRole(["STUDENT"])`, resolve the student profile from the session, then re-check the window; plain forms; `redirect("?error=…")` banners.

A shared `lib/student-access.ts` holds `requireStudentProfile()` and `getRegistrationWindow()` so the two rules live in one place, mirroring `lib/teacher-access.ts`.

## Testing

Unit tests for the registration-window predicate (open, before, after, and the exact boundary instants) and for the credit-weighted GPA function (including the no-grades case and a weighting case where an unweighted mean would give a different answer). Manual end-to-end verification covers enrolling, dropping, re-enrolling the same section, and a stale-form submit after the window closes.

## Known Gap Carried Forward

Session invalidation, unchanged since Phase 2 and still unfixed at the end of the build: the JWT has no `maxAge` (30-day default) and the `jwt` callback never re-reads the database, so deactivating a user or resetting a password does not end an existing session. `isActive` is checked only in `authorize()` at login. This should be fixed before any real deployment.
