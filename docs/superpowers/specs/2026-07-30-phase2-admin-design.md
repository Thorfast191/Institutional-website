# Admin Dashboard — Design (Phase 2)

## Status

Approved by user 2026-07-30 (streamlined process — derived directly from Phase 1's
Role Permission Matrix and Key Decisions, confirmed in conversation rather than a
full clarifying-question pass). Second of five incrementally-built phases; Phase 1
(schema, auth, RBAC, seed, shells) is complete and merged to `main`.

## Scope

Everything Phase 1 called "system settings," Admin-exclusive: User accounts (all
roles), Departments, Programs, and Grade Scale. Nothing else — Manager/Teacher/
Student features are separate phases.

## Non-Goals

- No email/notification flow (Phase 1's Out of Scope still applies) — Admin sets
  passwords directly, there is no "forgot password" self-service.
- No role changes after account creation (would orphan a Teacher/StudentProfile).
- No cross-row overlap/gap validation on Grade Scale bands (YAGNI — doesn't block
  anything until Phase 4's grade computation).
- No schema changes. Every field this phase touches already exists on `User`,
  `TeacherProfile`, `StudentProfile`, `Department`, `Program`, `GradeScale` from
  Phase 1.

## New Shared Building Block: `requireRole()`

Phase 1 deliberately deferred a generic Server Action role guard ("would have no
caller yet"). Admin's mutations are the first role-gated Server Actions in the
app, so this phase adds it to `lib/permissions.ts`:

```ts
export async function requireRole(allowedRoles: Role[]): Promise<Session> {
  const session = await auth();
  if (!session?.user?.role || !allowedRoles.includes(session.user.role)) {
    throw new Error("Unauthorized");
  }
  return session;
}
```

Every Server Action in this phase (and all future phases) calls
`await requireRole(["ADMIN"])` as its first line — defense-in-depth alongside the
existing `middleware.ts` path-prefix enforcement. Since this throws (not a
redirect), Server Actions catch it and return the discriminated error result
(see Error Handling below); it is not expected to normally trigger, since
middleware already blocks non-Admins from reaching `/admin/*`.

## Features

### Users (`/admin/users`)

- **List** — table of all users: name, email, role, active/inactive, with a
  role filter (`?role=`). Server Component, reads directly via Prisma.
- **Create** (`/admin/users/new`) — form: name, email, password, role (select).
  Role-conditional fields render client-side based on the selected role:
  - `TEACHER` → employeeId, department (select), designation
  - `STUDENT` → studentId, program (select)
  - `ADMIN` / `MANAGER` → no extra fields
  Server Action creates the `User` row (bcrypt-hashed password via the existing
  `hashPassword`) and, in the same Prisma transaction, the `TeacherProfile` or
  `StudentProfile` row if applicable.
- **Edit** (`/admin/users/[id]/edit`) — name, email, and role-specific profile
  fields are editable. **Role itself is not editable** — the form does not
  render a role selector on edit, only a read-only role badge.
- **Deactivate / Reactivate** — a button on the list/detail view toggling
  `isActive`. Never a hard delete (Phase 1 Global Constraint).
- **Reset password** — a small separate form/action (e.g. on the edit page):
  Admin types a new password directly, Server Action re-hashes and updates.

### Departments (`/admin/departments`)

- List, create, edit (name, code).
- Delete: attempts `prisma.department.delete`; catches Prisma's foreign-key
  restrict error (`P2003` / `P2014`) and returns a friendly field-level error
  ("Cannot delete — N programs still reference this department") instead of a
  raw Prisma exception, per Phase 1's Error Handling conventions.

### Programs (`/admin/programs`)

- List, create, edit (name, code, department select). Delete guarded the same
  way as Departments (FK-restrict from `Subject`/`StudentProfile`).

### Grade Scale (`/admin/grade-scale`)

- List (ordered by `minMarks` descending), create, edit, delete grade bands
  (minMarks, maxMarks, letterGrade, gradePoint).
- Validation: `minMarks < maxMarks` only.

## Server Actions & Validation

- One `lib/validation/*.ts` zod schema per form (`user.ts`, `department.ts`,
  `program.ts`, `grade-scale.ts`), mirroring Phase 1's `lib/validation/login.ts`
  pattern.
- Server Actions return `{success: true, data} | {success: false, error}` — no
  throwing for expected validation/business failures (Phase 1 spec's Error
  Handling convention). `requireRole()`'s thrown `Unauthorized` is the one
  exception, caught at the top of each action and mapped to the same shape.
- Unique constraint violations (duplicate email, employeeId, studentId, code)
  are caught (`P2002`) and mapped to a friendly field-level error naming the
  duplicate field.

## Routing Structure

```
app/(dashboard)/admin/
  page.tsx                    # overview (replaces Phase 1 placeholder)
  users/
    page.tsx                  # list + role filter
    new/page.tsx
    [id]/edit/page.tsx
  departments/
    page.tsx
    new/page.tsx
    [id]/edit/page.tsx
  programs/
    page.tsx
    new/page.tsx
    [id]/edit/page.tsx
  grade-scale/
    page.tsx
    new/page.tsx
    [id]/edit/page.tsx
lib/
  permissions.ts               # + requireRole()
  validation/
    user.ts
    department.ts
    program.ts
    grade-scale.ts
```

`app/(dashboard)/layout.tsx` gains a small role-aware nav (Admin sees links to
Users/Departments/Programs/Grade Scale; other roles' nav is added in their own
phases).

## Testing

- Vitest unit tests for each new zod validation schema and for `requireRole()`
  (mirrors Phase 1's `lib/permissions.test.ts` style — mock session shapes, no
  DB).
- No DB-backed automated tests in this phase (consistent with Phase 1 — CRUD
  flows are verified manually against the seeded dev database, same as Phase
  1's Task 11).

## Out of Scope for Phase 2

Manager/Teacher/Student dashboards (separate phases), password strength rules
beyond zod's `min(8)`, audit logging of Admin actions, bulk user import.
