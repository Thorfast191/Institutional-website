# Academic Institution Management System — Schema & Auth Design (Phase 1)

## Status

Approved by user 2026-07-29. This is Phase 1 of an incrementally-built app. Each
role's dashboard (Admin, Manager, Teacher, Student) gets its own spec once this
foundation exists — this document does not cover dashboard UI/features beyond a
bare authenticated shell.

## Scope

Full database schema (sized for all future phases), authentication, role-based
route protection, and a seed script. Nothing else.

## Tech Stack

- Next.js (App Router) + TypeScript. Server Components for reads, Server Actions
  for mutations — no separate REST/tRPC API layer. The only Route Handler is
  NextAuth's `/api/auth/[...nextauth]`.
- PostgreSQL + Prisma ORM.
- Auth.js v5 (NextAuth's App-Router-native package), Credentials provider, JWT
  session strategy (stateless, Edge-compatible via `getToken()`).
- Tailwind CSS.
- Exact package versions/pinning are an implementation-plan concern, not a
  design concern.

## Key Decisions

These resolve the ambiguities in the original request; each was confirmed in
conversation:

- **Program vs Subject:** Program = a degree (e.g. "BSc in CSE"), Admin-owned.
  Subject = an individual class (e.g. "CSE101"), Manager-owned, belongs to a
  Program. A Department can offer multiple Programs.
- **Term** is a formal entity ("Fall 2026") with start/end dates. All
  scheduling data (Sections, Exams, FeeItems) hangs off a Term.
- **Registration window** lives on Term (`registrationOpensAt`/
  `registrationClosesAt`), not globally or per-Subject — gives per-term
  flexibility without extra complexity.
- **Accounts** (Student & Teacher) are provisioned only by Admin — no public
  self-registration for accounts.
- **Course registration is self-service:** students browse offered Sections
  and enroll themselves within the active Term's registration window. No seat
  limits or prerequisite checks in v1.
- A Subject can have **multiple Sections** per Term, each with its own Teacher
  and roster.
- **Exams** are scheduled per Subject, shared across all Sections of that
  Subject in a Term — not per-Section.
- **Grades:** teachers enter numeric marks; letter grade + GPA point are
  derived automatically from an Admin-configurable `GradeScale` table.
- **Dues** are itemized by `FeeType` (tuition, lab, library, ...) with a
  `Payment` history log per item. `FeeItem.status` is recalculated by the
  Server Action after each Payment insert (not computed on read).
- **Teacher account CRUD is Admin-only.** Manager can assign teachers to
  Sections/schedules but cannot create/edit/deactivate their User accounts.
- **"System settings"** (Admin-exclusive) = User accounts, GradeScale config,
  Department/Program structure. Everything operational (Subjects, Sections,
  Routines, Exams, Fees) is Manager-owned.
- **Admin's UI is scoped to `/admin` only** in v1 — no merged access into
  Manager/Teacher/Student views.
- **Audit trails:** Manager force-drops of an Enrollment are recorded via
  `droppedBy`/`droppedAt`; manual Payment entries are recorded via
  `recordedBy`, mirroring how Grade already tracks `gradedBy`.
- Exactly one Term should have `isActive = true` at a time, representing
  "current term" for dashboards — enforced at the application layer, not a DB
  constraint.
- A Section's meeting times/rooms live entirely on `Routine` (one row per
  weekly slot); `Section` itself has no `room` field, since a Section can meet
  in different rooms across the week (e.g. lecture vs. lab).
- An Exam is uniquely identified by (Subject, Term, examType, sequence) — the
  `sequence` field lets `QUIZ` (and any other repeatable type) have multiple
  instances (Quiz 1, Quiz 2, ...) per Subject per Term, while `MIDTERM`/
  `FINAL` simply stay at the default `sequence = 1`.
- All relations are Prisma's implicit default (`Restrict`) — no cascading
  deletes anywhere in this schema. `User` removal is handled by setting
  `isActive = false`, never a hard delete, so grade/payment/audit history
  (`gradedBy`, `recordedBy`, `droppedBy`) always stays resolvable.

## Data Model

| Entity | Key fields | Notes |
|---|---|---|
| **User** | id, name, email (unique), passwordHash, role (`ADMIN\|MANAGER\|TEACHER\|STUDENT`), isActive | Base account for all roles |
| **StudentProfile** | userId (1:1), studentId (roll no., unique), programId | Extends User for students |
| **TeacherProfile** | userId (1:1), employeeId (unique), departmentId, designation | Extends User for teachers |
| **Department** | id, name, code | Admin-owned |
| **Program** | id, name, code, departmentId | e.g. "BSc in CSE"; Admin-owned; a Department can have many |
| **Term** | id, name, startDate, endDate, isActive, registrationOpensAt, registrationClosesAt | e.g. "Fall 2026"; Manager-owned |
| **Subject** | id, name, code, credits, programId | e.g. "CSE101"; Manager-owned |
| **Section** | id, subjectId, termId, teacherId, label ("A"/"B") | One Subject can have several Sections per Term |
| **Routine** | id, sectionId, dayOfWeek, startTime, endTime, room | Weekly recurring slot(s) per Section; room lives here, not on Section |
| **Exam** | id, subjectId, termId, examType, sequence, date, startTime, endTime, room | Shared across all sections of a Subject; sequence allows multiple instances of a type (e.g. Quiz 1, Quiz 2) |
| **Enrollment** | id, studentId, sectionId, status (`ENROLLED\|DROPPED\|COMPLETED`), enrolledAt, droppedAt, droppedBy | Unique (studentId, sectionId); created by student self-registration; droppedBy/droppedAt audit a Manager force-drop |
| **Grade** | id, enrollmentId (1:1), marks, letterGrade, gradePoint, gradedAt, gradedBy | Letter/GPA auto-derived from GradeScale on save |
| **GradeScale** | id, minMarks, maxMarks, letterGrade, gradePoint | Admin-configurable, school-wide |
| **FeeItem** | id, studentId, termId, feeType, amount, dueDate, status (`UNPAID\|PARTIAL\|PAID`) | Itemized dues |
| **Payment** | id, feeItemId, amount, paidAt, method, reference, recordedBy | Payment history against a FeeItem; recordedBy audits manual entry |

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  MANAGER
  TEACHER
  STUDENT
}

enum EnrollmentStatus {
  ENROLLED
  DROPPED
  COMPLETED
}

enum FeeType {
  TUITION
  LAB
  LIBRARY
  EXAM
  OTHER
}

enum FeeStatus {
  UNPAID
  PARTIAL
  PAID
}

enum PaymentMethod {
  CASH
  BANK
  ONLINE
  OTHER
}

enum ExamType {
  MIDTERM
  FINAL
  QUIZ
  OTHER
}

enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  studentProfile StudentProfile?
  teacherProfile TeacherProfile?

  grades   Grade[]
  payments Payment[]
  drops    Enrollment[]
}

model Department {
  id              String           @id @default(cuid())
  name            String
  code            String           @unique
  programs        Program[]
  teacherProfiles TeacherProfile[]
}

model Program {
  id              String           @id @default(cuid())
  name            String
  code            String           @unique
  departmentId    String
  department      Department       @relation(fields: [departmentId], references: [id])
  subjects        Subject[]
  studentProfiles StudentProfile[]
}

model Term {
  id                   String   @id @default(cuid())
  name                 String
  startDate            DateTime
  endDate              DateTime
  isActive             Boolean  @default(false)
  registrationOpensAt  DateTime
  registrationClosesAt DateTime

  sections Section[]
  exams    Exam[]
  feeItems FeeItem[]
}

model Subject {
  id        String    @id @default(cuid())
  name      String
  code      String    @unique
  credits   Int
  programId String
  program   Program   @relation(fields: [programId], references: [id])
  sections  Section[]
  exams     Exam[]
}

model TeacherProfile {
  id           String     @id @default(cuid())
  userId       String     @unique
  user         User       @relation(fields: [userId], references: [id])
  employeeId   String     @unique
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])
  designation  String
  sections     Section[]
}

model StudentProfile {
  id          String       @id @default(cuid())
  userId      String       @unique
  user        User         @relation(fields: [userId], references: [id])
  studentId   String       @unique
  programId   String
  program     Program      @relation(fields: [programId], references: [id])
  enrollments Enrollment[]
  feeItems    FeeItem[]
}

model Section {
  id        String         @id @default(cuid())
  subjectId String
  subject   Subject        @relation(fields: [subjectId], references: [id])
  termId    String
  term      Term           @relation(fields: [termId], references: [id])
  teacherId String
  teacher   TeacherProfile @relation(fields: [teacherId], references: [id])
  label     String

  routines    Routine[]
  enrollments Enrollment[]

  @@unique([subjectId, termId, label])
}

model Routine {
  id        String    @id @default(cuid())
  sectionId String
  section   Section   @relation(fields: [sectionId], references: [id])
  dayOfWeek DayOfWeek
  startTime DateTime  @db.Time
  endTime   DateTime  @db.Time
  room      String
}

model Exam {
  id        String   @id @default(cuid())
  subjectId String
  subject   Subject  @relation(fields: [subjectId], references: [id])
  termId    String
  term      Term     @relation(fields: [termId], references: [id])
  examType  ExamType
  sequence  Int      @default(1)
  date      DateTime @db.Date
  startTime DateTime @db.Time
  endTime   DateTime @db.Time
  room      String

  @@unique([subjectId, termId, examType, sequence])
}

model Enrollment {
  id         String           @id @default(cuid())
  studentId  String
  student    StudentProfile   @relation(fields: [studentId], references: [id])
  sectionId  String
  section    Section          @relation(fields: [sectionId], references: [id])
  status     EnrollmentStatus @default(ENROLLED)
  enrolledAt DateTime         @default(now())
  droppedAt  DateTime?
  droppedBy  String?
  droppedByUser User?         @relation(fields: [droppedBy], references: [id])

  grade Grade?

  @@unique([studentId, sectionId])
}

model Grade {
  id           String     @id @default(cuid())
  enrollmentId String     @unique
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id])
  marks        Decimal
  letterGrade  String
  gradePoint   Decimal
  gradedAt     DateTime   @default(now())
  gradedBy     String
  gradedByUser User       @relation(fields: [gradedBy], references: [id])
}

model GradeScale {
  id          String  @id @default(cuid())
  minMarks    Decimal
  maxMarks    Decimal
  letterGrade String
  gradePoint  Decimal
}

model FeeItem {
  id        String         @id @default(cuid())
  studentId String
  student   StudentProfile @relation(fields: [studentId], references: [id])
  termId    String
  term      Term           @relation(fields: [termId], references: [id])
  feeType   FeeType
  amount    Decimal
  dueDate   DateTime
  status    FeeStatus      @default(UNPAID)

  payments Payment[]
}

model Payment {
  id             String        @id @default(cuid())
  feeItemId      String
  feeItem        FeeItem       @relation(fields: [feeItemId], references: [id])
  amount         Decimal
  paidAt         DateTime      @default(now())
  method         PaymentMethod
  reference      String?
  recordedBy     String
  recordedByUser User          @relation(fields: [recordedBy], references: [id])
}
```

## Auth Flow

1. **Login** (public route) — email/password form calls `signIn("credentials", …)`.
2. **`authorize()`** — look up `User` by email, check `isActive`, `bcrypt.compare`
   against `passwordHash`. Returns `{id, name, email, role}` or `null`.
3. **Session strategy: JWT** — the `jwt` callback embeds `id` + `role` into the
   token at sign-in; the `session` callback exposes `session.user.id/role`.
4. **`middleware.ts`** — matcher on `/admin/:path*`, `/manager/:path*`,
   `/teacher/:path*`, `/student/:path*`. Reads the token via `getToken()`; no
   token → redirect `/login`; wrong role for the path prefix → redirect to the
   user's own dashboard.
5. **Server Actions** — every mutation starts with a `requireRole(session,
   [...])` guard before touching Prisma. Non-negotiable on Grade writes and
   Fee/Payment writes; applied everywhere as defense-in-depth alongside
   middleware.
6. **Course registration action** specifically checks, in order: (a) session
   role is `STUDENT`, (b) `now` is within the active Term's
   `registrationOpensAt`/`registrationClosesAt` window, (c) no existing
   `ENROLLED`/`COMPLETED` Enrollment already exists for that student+section.
   Returns a specific error per failed check. No seat-limit or prerequisite
   checks in v1.

## Role Permission Matrix

| Resource | Admin | Manager | Teacher | Student |
|---|---|---|---|---|
| User accounts (all roles) | Full CRUD | — | — | — |
| Departments / Programs | Full CRUD | Read | Read | Read |
| Grade scale | Full CRUD | Read | Read | Read |
| Subjects / Sections / registration window | Read | Full CRUD | Read (own sections) | Read (browse to register) |
| Routines & Exams | Read | Full CRUD | Read (own) | Read (own) |
| Enrollments | Read | Read + override (force-drop, audited) | Read own roster | Self-register/drop within window |
| Grades | Read all | Read all | Write (own sections only) | Read own only |
| Fees / Payments | Read | Full CRUD (audited) | — | Read own only |

## Routing Structure

```
app/
  (public)/login/page.tsx
  (dashboard)/
    layout.tsx                 # session-aware shell, role-based nav
    admin/{page,users,departments,programs,grade-scale}/...
    manager/{page,subjects,sections,routines,exams,fees}/...
    teacher/{page,sections/[id]/grades}/...
    student/{page,courses,grades,routine,exams,dues}/...
  api/auth/[...nextauth]/route.ts
middleware.ts
lib/{auth.ts, prisma.ts, permissions.ts}
prisma/{schema.prisma, seed.ts}
```

`(dashboard)/*/page.tsx` in this phase renders a minimal authenticated
placeholder per role (confirms login + RBAC works end-to-end); real dashboard
features are built in later phases/specs.

## Seed Script Scope

- 1 Admin, 1 Manager, 2–3 Teachers, 5–8 Students.
- 2 Departments, 3 Programs, 2 Terms (1 past/`isActive:false`, 1 current/
  `isActive:true` with an open registration window).
- 6–8 Subjects, 8–10 Sections across them (varying teachers/labels).
- Routines for each Section; 2–3 Exams, including at least one Subject with
  two `QUIZ` rows (sequence 1 and 2) to exercise the multi-instance case.
- `GradeScale` rows covering a standard 4.0 scale (A+ down to F).
- A mix of Enrollments: several `ENROLLED` (current term, self-registered),
  some `COMPLETED` with Grades (past term), one `DROPPED` with
  `droppedBy`/`droppedAt` populated to demonstrate the audit trail.
- FeeItems in a mix of `UNPAID`/`PARTIAL`/`PAID` states, with Payment rows
  (including `recordedBy`) backing the non-`UNPAID` ones.
- Passwords are bcrypt-hashed; the seed script prints plaintext
  email/password pairs to the console at the end for manual login testing.

## Error Handling & Validation Conventions

- Zod schemas validate all Server Action inputs before touching Prisma.
- Server Actions return a discriminated result (`{success:true,...} |
  {success:false,error}`) rather than throwing, so forms render inline field
  errors.
- Unique constraint violations (duplicate email, studentId, employeeId) are
  mapped to friendly field-level errors, not raw Prisma errors.
- `app/error.tsx` plus a per-route-group boundary handle unexpected failures.
- NextAuth's built-in error redirect (`/login?error=...`) surfaces
  auth-specific failures (bad credentials, inactive account).

## Out of Scope for Phase 1

Dashboard UI/features beyond a bare authenticated shell, prerequisites/
curriculum rules, seat limits, waitlists, notifications/email, file uploads,
and an automated test suite (verified manually via seed data for now; can be
added later if wanted).
