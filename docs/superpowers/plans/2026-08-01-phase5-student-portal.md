# Phase 5: Student Portal Implementation Plan

**Goal:** Students register inside the term window and see their own courses, grades, routine, exams, and dues. Closes the build.

**Architecture:** As Phases 2–4.

## Global Constraints

- Every query filters on the student profile resolved **from the session**. No student id is ever read from a URL or form.
- The registration window is re-checked inside every Server Action; hiding a button is not enforcement.
- Registration is an **upsert** — `@@unique([studentId, sectionId])` means a re-enroll after a drop must update, not insert.
- Decimal discipline for GPA and dues: `Prisma.Decimal` arithmetic, `.toString()` / `.toFixed(2)` only at render.
- No schema changes; no deletes.

## Prerequisites

1. `main` clean: 114 tests / 18 files, `tsc --noEmit` and `next build` green.
2. `git worktree add .worktrees/phase5-student-portal -b phase5-student-portal main`, `cd` in, `npm install`, `npx prisma generate`, `cp ../../.env .env`.
3. Verify: `npx tsc --noEmit && npm test`.

---

### Task 1: Registration window and GPA helpers

**Files:** create `lib/student-term.ts`, test `lib/student-term.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/student-term.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { isRegistrationOpen, calculateGpa } from "@/lib/student-term";

const d = (v: string) => new Prisma.Decimal(v);
const window = {
  registrationOpensAt: new Date("2026-07-01T00:00:00Z"),
  registrationClosesAt: new Date("2026-08-15T00:00:00Z"),
};

describe("isRegistrationOpen", () => {
  it("is open inside the window", () => {
    expect(isRegistrationOpen(window, new Date("2026-07-20T12:00:00Z"))).toBe(true);
  });

  it("is closed before it opens", () => {
    expect(isRegistrationOpen(window, new Date("2026-06-30T23:59:59Z"))).toBe(false);
  });

  it("is closed after it closes", () => {
    expect(isRegistrationOpen(window, new Date("2026-08-15T00:00:01Z"))).toBe(false);
  });

  it("is open on the exact opening instant", () => {
    expect(isRegistrationOpen(window, window.registrationOpensAt)).toBe(true);
  });

  it("is open on the exact closing instant", () => {
    expect(isRegistrationOpen(window, window.registrationClosesAt)).toBe(true);
  });

  it("is closed when there is no active term", () => {
    expect(isRegistrationOpen(null, new Date("2026-07-20T12:00:00Z"))).toBe(false);
  });
});

describe("calculateGpa", () => {
  it("returns null with no graded courses", () => {
    expect(calculateGpa([])).toBeNull();
  });

  it("returns the grade point of a single course", () => {
    expect(calculateGpa([{ gradePoint: d("3.75"), credits: 3 }])?.toFixed(2)).toBe("3.75");
  });

  it("weights by credits, not a plain mean", () => {
    // Plain mean would be 3.00; credit-weighted is (4*3 + 2*9) / 12 = 2.50.
    const gpa = calculateGpa([
      { gradePoint: d("4"), credits: 3 },
      { gradePoint: d("2"), credits: 9 },
    ]);
    expect(gpa?.toFixed(2)).toBe("2.50");
  });

  it("computes an exact repeating average without float drift", () => {
    const gpa = calculateGpa([
      { gradePoint: d("3.75"), credits: 3 },
      { gradePoint: d("3.5"), credits: 3 },
      { gradePoint: d("4"), credits: 3 },
    ]);
    expect(gpa?.toFixed(2)).toBe("3.75");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Write lib/student-term.ts**

```ts
import { Prisma } from "@prisma/client";

type RegistrationWindow = {
  registrationOpensAt: Date;
  registrationClosesAt: Date;
};

// Both ends inclusive. `now` is a parameter rather than read inside so the
// boundary cases are testable — and so a Server Action and the page it
// rendered can agree on one instant.
export function isRegistrationOpen(
  window: RegistrationWindow | null,
  now: Date
): boolean {
  if (!window) return false;
  return (
    now.getTime() >= window.registrationOpensAt.getTime() &&
    now.getTime() <= window.registrationClosesAt.getTime()
  );
}

// Credit-weighted mean of grade points. Decimal throughout: a GPA is divided
// by a credit total that is routinely 9 or 12, so float drift would show up in
// the second decimal place a student actually reads.
export function calculateGpa(
  courses: { gradePoint: Prisma.Decimal; credits: number }[]
): Prisma.Decimal | null {
  if (courses.length === 0) return null;

  let weighted = new Prisma.Decimal(0);
  let totalCredits = new Prisma.Decimal(0);
  for (const c of courses) {
    weighted = weighted.plus(c.gradePoint.times(c.credits));
    totalCredits = totalCredits.plus(c.credits);
  }
  if (totalCredits.comparedTo(0) === 0) return null;

  return weighted.dividedBy(totalCredits);
}
```

- [ ] **Step 4: Run test, verify it passes (10 tests)**

- [ ] **Step 5: Commit** — `git commit -m "Add registration window and credit-weighted GPA helpers"`

---

### Task 2: Student access guard and registration actions

**Files:** create `lib/student-access.ts`, create `lib/actions/registration.ts`

- [ ] **Step 1: Write lib/student-access.ts**

```ts
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

// Every student query filters on the profile resolved here, from the session.
// No page or action accepts a student id from the client.
export async function requireStudentProfile() {
  const session = await requireRole(["STUDENT"]);
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, studentId: true, programId: true },
  });
  if (!profile) {
    throw new Error("No student profile for this account");
  }
  return { session, profile };
}

export async function getActiveTerm() {
  return prisma.term.findFirst({ where: { isActive: true } });
}
```

- [ ] **Step 2: Write lib/actions/registration.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { isRegistrationOpen } from "@/lib/student-term";

const CLOSED_MESSAGE = "Registration is closed for the current term.";

export async function enrollInSection(sectionId: string) {
  const { profile } = await requireStudentProfile();

  const activeTerm = await getActiveTerm();
  // Re-checked here, not just in the page: a stale form submitted after the
  // window shut must be rejected. Hiding the button is convenience, not
  // enforcement.
  if (!isRegistrationOpen(activeTerm, new Date())) {
    redirect(`/student/register?error=${encodeURIComponent(CLOSED_MESSAGE)}`);
  }

  // The section must belong to the active term — a student cannot register for
  // a past term's section by passing its id.
  const section = await prisma.section.findFirst({
    where: { id: sectionId, termId: activeTerm!.id },
    select: { id: true },
  });
  if (!section) {
    redirect(
      `/student/register?error=${encodeURIComponent(
        "That section is not open for registration."
      )}`
    );
  }

  // @@unique([studentId, sectionId]) means re-enrolling after a drop must
  // update the existing row; an insert would violate the constraint.
  await prisma.enrollment.upsert({
    where: { studentId_sectionId: { studentId: profile.id, sectionId } },
    create: { studentId: profile.id, sectionId, status: EnrollmentStatus.ENROLLED },
    update: {
      status: EnrollmentStatus.ENROLLED,
      droppedAt: null,
      droppedBy: null,
      enrolledAt: new Date(),
    },
  });

  redirect("/student/register");
}

export async function dropOwnEnrollment(sectionId: string) {
  const { session, profile } = await requireStudentProfile();

  const activeTerm = await getActiveTerm();
  if (!isRegistrationOpen(activeTerm, new Date())) {
    redirect(
      `/student/register?error=${encodeURIComponent(
        "Registration is closed — ask the office to drop this course."
      )}`
    );
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: profile.id, sectionId, status: EnrollmentStatus.ENROLLED },
    select: { id: true },
  });
  if (!enrollment) {
    redirect(
      `/student/register?error=${encodeURIComponent("You are not enrolled in that section.")}`
    );
  }

  // Same audit fields the Manager's force-drop writes; droppedBy is the
  // student's own user id, taken from the session.
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: EnrollmentStatus.DROPPED,
      droppedAt: new Date(),
      droppedBy: session.user.id,
    },
  });

  redirect("/student/register");
}
```

- [ ] **Step 3: `npx tsc --noEmit`**

Note: `studentId_sectionId` is Prisma's generated compound-unique key name for `@@unique([studentId, sectionId])`. If it type-errors, check the generated client for the exact name rather than falling back to `findFirst` + branch.

- [ ] **Step 4: Commit** — `git commit -m "Add student access guard and registration actions"`

---

### Task 3: Student overview page

**Files:** replace `app/(dashboard)/student/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { isRegistrationOpen, calculateGpa } from "@/lib/student-term";
import { formatDateInput } from "@/lib/time";

export default async function StudentDashboardPage() {
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();
  const open = isRegistrationOpen(activeTerm, new Date());

  const enrollments = activeTerm
    ? await prisma.enrollment.findMany({
        where: {
          studentId: profile.id,
          status: { not: EnrollmentStatus.DROPPED },
          section: { termId: activeTerm.id },
        },
        include: { grade: true, section: { include: { subject: true } } },
      })
    : [];

  const graded = enrollments.filter((e) => e.grade !== null);
  const gpa = calculateGpa(
    graded.map((e) => ({ gradePoint: e.grade!.gradePoint, credits: e.section.subject.credits }))
  );

  const unpaid = await prisma.feeItem.count({
    where: { studentId: profile.id, status: { not: "PAID" } },
  });

  const cards = [
    { label: "Courses", value: String(enrollments.length), href: "/student/courses" },
    { label: "Graded", value: `${graded.length} / ${enrollments.length}`, href: "/student/courses" },
    { label: "GPA", value: gpa ? gpa.toFixed(2) : "—", href: "/student/courses" },
    { label: "Unpaid Fees", value: String(unpaid), href: "/student/dues" },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Dashboard</h1>
      <p className="mb-1 text-sm text-slate-600">Student ID: {profile.studentId}</p>
      <p className="mb-6 text-sm text-slate-600">
        {activeTerm ? (
          <>
            {activeTerm.name} · registration{" "}
            {open ? (
              <span className="font-medium text-green-700">
                open until {formatDateInput(activeTerm.registrationClosesAt)}
              </span>
            ) : (
              <span className="font-medium text-slate-700">closed</span>
            )}
          </>
        ) : (
          "No active term."
        )}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-300"
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{c.value}</p>
          </Link>
        ))}
      </div>

      {open && (
        <Link
          href="/student/register"
          className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Register for Courses
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add STUDENT_NAV to app/(dashboard)/layout.tsx**

```tsx
const STUDENT_NAV = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/register", label: "Register" },
  { href: "/student/courses", label: "My Courses" },
  { href: "/student/routine", label: "Routine" },
  { href: "/student/exams", label: "Exams" },
  { href: "/student/dues", label: "Dues" },
];
```

and add `STUDENT: STUDENT_NAV` to `NAV_BY_ROLE`. Delete the now-stale comment about Student being absent.

- [ ] **Step 3: `npx tsc --noEmit && npm run build`**

- [ ] **Step 4: Commit** — `git commit -m "Add Student overview page and nav"`

---

### Task 4: Registration page

**Files:** create `app/(dashboard)/student/register/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { isRegistrationOpen } from "@/lib/student-term";
import { formatDateInput } from "@/lib/time";
import { enrollInSection, dropOwnEnrollment } from "@/lib/actions/registration";

export default async function StudentRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();
  const open = isRegistrationOpen(activeTerm, new Date());

  const [sections, myEnrollments] = await Promise.all([
    activeTerm
      ? prisma.section.findMany({
          where: { termId: activeTerm.id },
          include: { subject: true, teacher: { include: { user: true } } },
          orderBy: [{ subject: { code: "asc" } }, { label: "asc" }],
        })
      : Promise.resolve([]),
    prisma.enrollment.findMany({
      where: { studentId: profile.id },
      select: { sectionId: true, status: true },
    }),
  ]);

  const statusBySection = new Map(myEnrollments.map((e) => [e.sectionId, e.status]));

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Course Registration</h1>
      <p className="mb-6 text-sm text-slate-600">
        {activeTerm ? (
          open ? (
            <>
              {activeTerm.name} · open until{" "}
              {formatDateInput(activeTerm.registrationClosesAt)}
            </>
          ) : (
            <>
              {activeTerm.name} · registration is closed (
              {formatDateInput(activeTerm.registrationOpensAt)} –{" "}
              {formatDateInput(activeTerm.registrationClosesAt)})
            </>
          )
        ) : (
          "No active term."
        )}
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {sections.length === 0 ? (
        <p className="text-sm text-slate-500">No sections are available.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Teacher</th>
              <th className="px-4 py-2 font-medium">Credits</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const status = statusBySection.get(s.id);
              const enrolled = status === EnrollmentStatus.ENROLLED;
              return (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 text-slate-900">
                    {s.subject.code} — {s.subject.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.label}</td>
                  <td className="px-4 py-2 text-slate-600">{s.teacher.user.name}</td>
                  <td className="px-4 py-2 text-slate-600">{s.subject.credits}</td>
                  <td className="px-4 py-2">
                    {enrolled ? (
                      open ? (
                        <form action={dropOwnEnrollment.bind(null, s.id)}>
                          <span className="mr-3 font-medium text-green-700">Enrolled</span>
                          <button type="submit" className="text-red-600 underline">
                            Drop
                          </button>
                        </form>
                      ) : (
                        <span className="font-medium text-green-700">Enrolled</span>
                      )
                    ) : open ? (
                      <form action={enrollInSection.bind(null, s.id)}>
                        <button type="submit" className="text-slate-600 underline">
                          {status === EnrollmentStatus.DROPPED ? "Re-enroll" : "Enroll"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `npx tsc --noEmit && npm run build`**

- [ ] **Step 3: Commit** — `git commit -m "Add student course registration page"`

---

### Task 5: Courses, routine, exams, and dues pages

**Files:** create `app/(dashboard)/student/{courses,routine,exams,dues}/page.tsx`

All four are read-only and filter on the session-resolved profile.

- [ ] **Step 1: courses/page.tsx**

```tsx
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile } from "@/lib/student-access";
import { calculateGpa } from "@/lib/student-term";
import { resolveTermFilter } from "@/lib/term-filter";
import Link from "next/link";

export default async function StudentCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string }>;
}) {
  const { termId } = await searchParams;
  const { profile } = await requireStudentProfile();
  const activeTermId = await resolveTermFilter(termId);

  const [enrollments, terms] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        studentId: profile.id,
        ...(activeTermId ? { section: { termId: activeTermId } } : {}),
      },
      include: {
        grade: true,
        section: { include: { subject: true, term: true, teacher: { include: { user: true } } } },
      },
      orderBy: { section: { subject: { code: "asc" } } },
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  const active = enrollments.filter((e) => e.status !== EnrollmentStatus.DROPPED);
  const gpa = calculateGpa(
    active
      .filter((e) => e.grade !== null)
      .map((e) => ({ gradePoint: e.grade!.gradePoint, credits: e.section.subject.credits }))
  );

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Courses</h1>
      <p className="mb-6 text-sm text-slate-600">GPA: {gpa ? gpa.toFixed(2) : "—"}</p>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/student/courses?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/student/courses?termId=all"
          className={!activeTermId ? "font-medium text-slate-900" : "text-slate-500"}
        >
          All terms
        </Link>
      </div>

      {enrollments.length === 0 ? (
        <p className="text-sm text-slate-500">You are not enrolled in any courses.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Teacher</th>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Marks</th>
              <th className="px-4 py-2 font-medium">Grade</th>
              <th className="px-4 py-2 font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => {
              const dropped = e.status === EnrollmentStatus.DROPPED;
              return (
                <tr
                  key={e.id}
                  className={`border-t border-slate-200 ${dropped ? "text-slate-400" : ""}`}
                >
                  <td className="px-4 py-2">
                    {e.section.subject.code} — {e.section.subject.name}
                  </td>
                  <td className="px-4 py-2">{e.section.label}</td>
                  <td className="px-4 py-2">{e.section.teacher.user.name}</td>
                  <td className="px-4 py-2">{e.section.term.name}</td>
                  <td className="px-4 py-2">
                    {dropped ? "Dropped" : (e.grade?.marks.toString() ?? "—")}
                  </td>
                  <td className="px-4 py-2 font-medium">{e.grade?.letterGrade ?? "—"}</td>
                  <td className="px-4 py-2">{e.grade?.gradePoint.toString() ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: routine/page.tsx**

Groups the enrolled sections' routine slots by day. Day order starts Monday, matching the `DayOfWeek` enum declaration.

```tsx
import { DayOfWeek, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { formatTimeInput } from "@/lib/time";

const DAYS: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

function dayLabel(day: DayOfWeek): string {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export default async function StudentRoutinePage() {
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();

  const enrollments = activeTerm
    ? await prisma.enrollment.findMany({
        where: {
          studentId: profile.id,
          status: { not: EnrollmentStatus.DROPPED },
          section: { termId: activeTerm.id },
        },
        include: {
          section: {
            include: { subject: true, routines: { orderBy: { startTime: "asc" } } },
          },
        },
      })
    : [];

  const slots = enrollments.flatMap((e) =>
    e.section.routines.map((r) => ({
      day: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room,
      code: e.section.subject.code,
      label: e.section.label,
    }))
  );

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Weekly Routine</h1>
      <p className="mb-6 text-sm text-slate-600">{activeTerm?.name ?? "No active term."}</p>

      {slots.length === 0 ? (
        <p className="text-sm text-slate-500">No scheduled classes.</p>
      ) : (
        <div className="space-y-4">
          {DAYS.map((day) => {
            const daySlots = slots
              .filter((s) => s.day === day)
              .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            if (daySlots.length === 0) return null;
            return (
              <div key={day} className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-2 font-medium text-slate-900">{dayLabel(day)}</h2>
                <ul className="space-y-1 text-sm text-slate-600">
                  {daySlots.map((s, i) => (
                    <li key={i}>
                      {formatTimeInput(s.startTime)} – {formatTimeInput(s.endTime)} ·{" "}
                      <span className="text-slate-900">
                        {s.code} ({s.label})
                      </span>{" "}
                      · {s.room}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: exams/page.tsx**

Exams are keyed by subject and term, so the student's exams are those for the subjects they are enrolled in this term.

```tsx
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { formatDateInput, formatTimeInput } from "@/lib/time";

export default async function StudentExamsPage() {
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();

  const enrollments = activeTerm
    ? await prisma.enrollment.findMany({
        where: {
          studentId: profile.id,
          status: { not: EnrollmentStatus.DROPPED },
          section: { termId: activeTerm.id },
        },
        select: { section: { select: { subjectId: true } } },
      })
    : [];

  const subjectIds = [...new Set(enrollments.map((e) => e.section.subjectId))];

  const exams =
    activeTerm && subjectIds.length > 0
      ? await prisma.exam.findMany({
          where: { termId: activeTerm.id, subjectId: { in: subjectIds } },
          include: { subject: true },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        })
      : [];

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Exam Schedule</h1>
      <p className="mb-6 text-sm text-slate-600">{activeTerm?.name ?? "No active term."}</p>

      {exams.length === 0 ? (
        <p className="text-sm text-slate-500">No exams scheduled for your courses.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Room</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((e) => (
              <tr key={e.id} className="border-t border-slate-200">
                <td className="px-4 py-2 text-slate-900">{e.subject.code}</td>
                <td className="px-4 py-2 text-slate-600">
                  {e.examType} {e.sequence > 1 ? e.sequence : ""}
                </td>
                <td className="px-4 py-2 text-slate-600">{formatDateInput(e.date)}</td>
                <td className="px-4 py-2 text-slate-600">
                  {formatTimeInput(e.startTime)} – {formatTimeInput(e.endTime)}
                </td>
                <td className="px-4 py-2 text-slate-600">{e.room}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: dues/page.tsx**

```tsx
import { prisma } from "@/lib/prisma";
import { requireStudentProfile } from "@/lib/student-access";
import { sumPayments } from "@/lib/fee-status";
import { formatDateInput } from "@/lib/time";

const STATUS_CLASS: Record<string, string> = {
  PAID: "text-green-700",
  PARTIAL: "text-amber-700",
  UNPAID: "text-red-700",
};

export default async function StudentDuesPage() {
  const { profile } = await requireStudentProfile();

  const feeItems = await prisma.feeItem.findMany({
    where: { studentId: profile.id },
    include: { term: true, payments: { select: { amount: true } } },
    orderBy: { dueDate: "asc" },
  });

  const totalOutstanding = feeItems.reduce((total, f) => {
    const paid = sumPayments(f.payments.map((p) => p.amount));
    const remaining = f.amount.minus(paid);
    return remaining.comparedTo(0) > 0 ? total.plus(remaining) : total;
  }, sumPayments([]));

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Dues</h1>
      <p className="mb-6 text-sm text-slate-600">
        Total outstanding:{" "}
        <span className="font-medium text-slate-900">{totalOutstanding.toString()}</span>
      </p>

      {feeItems.length === 0 ? (
        <p className="text-sm text-slate-500">No fees have been raised for you.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Paid</th>
              <th className="px-4 py-2 font-medium">Outstanding</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {feeItems.map((f) => {
              const paid = sumPayments(f.payments.map((p) => p.amount));
              const remaining = f.amount.minus(paid);
              return (
                <tr key={f.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 text-slate-900">{f.feeType}</td>
                  <td className="px-4 py-2 text-slate-600">{f.term.name}</td>
                  <td className="px-4 py-2 text-slate-600">{f.amount.toString()}</td>
                  <td className="px-4 py-2 text-slate-600">{paid.toString()}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {remaining.comparedTo(0) > 0 ? remaining.toString() : "0"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{formatDateInput(f.dueDate)}</td>
                  <td className={`px-4 py-2 font-medium ${STATUS_CLASS[f.status] ?? ""}`}>
                    {f.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `npx tsc --noEmit && npm run build`**

- [ ] **Step 6: Commit** — `git commit -m "Add student courses, routine, exams, and dues pages"`

---

### Task 6: Manual end-to-end verification

- [ ] **Step 1: `npm test`** — expect 114 + 10 = **124 across 19 files**.

- [ ] **Step 2:** Log in as `tanvir.ahmed@student.school.edu` / `Passw0rd!`. Expect `/student` showing the student id, the active term with its registration state, four cards, and the six-item nav.

- [ ] **Step 3 — the window:** The seeded Summer 2026 window is 2026-07-01 → 2026-08-15 and today is 2026-08-01, so registration is **open**. Confirm the overview says so and the register page shows Enroll/Drop controls.

- [ ] **Step 4 — enroll, drop, re-enroll:** Enroll in a section the student is not in. Confirm it shows Enrolled. Drop it; confirm the button becomes "Re-enroll" and the database row is `DROPPED` with `droppedBy` equal to **the student's own user id**. Re-enroll; confirm the row returns to `ENROLLED` with `droppedAt`/`droppedBy` cleared, and that there is still exactly **one** row for that (student, section) pair — the upsert, not a duplicate.

- [ ] **Step 5 — the window is enforced server-side:** Temporarily move the active term's `registrationClosesAt` into the past via a direct database update. Reload the register page and confirm the controls are gone. Then submit a stale form (re-open the page from history, or re-issue the POST) and confirm it is rejected with "Registration is closed for the current term." and that **no** enrollment row changed. Restore the term dates afterwards.

- [ ] **Step 6:** Check `/student/courses` (grades and GPA), `/student/routine` (times must match the seed — 09:00–10:20, not shifted), `/student/exams` (only subjects the student takes), and `/student/dues` (amounts and outstanding match what the Manager sees in Phase 3b).

- [ ] **Step 7 — own data only:** Confirm no student page accepts an id. Then log in as a second student (`sadia.islam@student.school.edu`) and confirm the courses, dues, and routine differ — i.e. each student sees their own rows.

- [ ] **Step 8:** Log in as Admin, Manager, and Teacher; confirm each is redirected away from `/student`.

- [ ] **Step 9:** Restore the database to seed state — undo any enrollments added during Step 4.

---

## Self-Review Notes

- **Both rules are enforced in one place each:** `requireStudentProfile()` for ownership, `isRegistrationOpen()` re-checked inside both actions for the window. Step 5 of verification exists specifically to prove the second is not UI-only.
- **Registration is an upsert** because `@@unique([studentId, sectionId])` makes re-enrollment an update; Step 4 checks for exactly one row.
- **Self-drop writes the same audit fields as the Manager's force-drop**, so the audit trail is uniform regardless of who dropped — with `droppedBy` distinguishing them.
- **GPA is credit-weighted and Decimal throughout**, with `.toFixed(2)` only at render; the "weights by credits" test would fail on a plain mean.
- **`sumPayments` is reused** from Phase 3b rather than re-summing payments a second way, so the student's view of a fee cannot disagree with the Manager's.
- **The section must belong to the active term** in `enrollInSection` — otherwise a student could register for a past term's section by passing its id, which the window check alone would not catch.
