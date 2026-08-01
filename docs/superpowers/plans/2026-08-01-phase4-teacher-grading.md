# Phase 4: Teacher Grading Implementation Plan

**Goal:** A teacher sees only their own sections, opens a roster, and enters marks; letter grade and grade point are derived from `GradeScale` with exact Decimal arithmetic.

**Architecture:** As Phases 2–3b. Server Components + Server Actions, plain forms, `redirect("?error=…")` banners.

## Global Constraints

- Every Server Action opens with `await requireRole(["TEACHER"])` **and then an ownership check**. Role alone is not authorization here.
- **Never trust an id from the form to imply access.** `enrollmentId` is validated by walking `Enrollment → Section → teacherId` server-side.
- `marks` and `gradePoint` are Decimal columns: validated strings into Prisma, `Prisma.Decimal` for comparisons, `.toString()` for rendering.
- `letterGrade`, `gradePoint`, `gradedBy` are server-derived and appear in no form.
- No schema changes; no deletes.

## Prerequisites

1. `main` clean: 100 tests / 16 files, `tsc --noEmit` and `next build` green.
2. `git worktree add .worktrees/phase4-teacher-grading -b phase4-teacher-grading main`, `cd` in, `npm install`, `npx prisma generate`, `cp ../../.env .env`.
3. Verify: `npx tsc --noEmit && npm test`.

---

### Task 1: Grade scale lookup

**Files:** create `lib/grade-scale.ts`, test `lib/grade-scale.test.ts`

**Produces:** `findGradeBand(marks, bands)` returning the matching band or `null`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/grade-scale.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { findGradeBand } from "@/lib/grade-scale";

const d = (v: string) => new Prisma.Decimal(v);
const band = (min: string, max: string, letter: string, point: string) => ({
  minMarks: d(min),
  maxMarks: d(max),
  letterGrade: letter,
  gradePoint: d(point),
});

// Mirrors the seeded scale: contiguous bands with .99 upper bounds.
const bands = [
  band("90", "100", "A+", "4"),
  band("85", "89.99", "A", "3.75"),
  band("80", "84.99", "A-", "3.5"),
  band("0", "39.99", "F", "0"),
];

describe("findGradeBand", () => {
  it("finds the band containing the marks", () => {
    expect(findGradeBand(d("87"), bands)?.letterGrade).toBe("A");
  });

  it("matches a mark exactly on the lower bound", () => {
    expect(findGradeBand(d("85"), bands)?.letterGrade).toBe("A");
  });

  it("matches a mark exactly on the upper bound", () => {
    // The case Phase 2's Decimal corruption would have broken: a band ending
    // at 89.98999999999999 matches nothing at 89.99.
    expect(findGradeBand(d("89.99"), bands)?.letterGrade).toBe("A");
  });

  it("matches the top of the top band", () => {
    expect(findGradeBand(d("100"), bands)?.letterGrade).toBe("A+");
  });

  it("matches zero", () => {
    expect(findGradeBand(d("0"), bands)?.letterGrade).toBe("F");
  });

  it("returns null when no band matches", () => {
    // 40–79.99 is deliberately absent from this fixture.
    expect(findGradeBand(d("50"), bands)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Write lib/grade-scale.ts**

```ts
import { Prisma } from "@prisma/client";

export type GradeBand = {
  minMarks: Prisma.Decimal;
  maxMarks: Prisma.Decimal;
  letterGrade: string;
  gradePoint: Prisma.Decimal;
};

// Bounds are inclusive on both ends, and the comparison uses Decimal rather
// than JS numbers: a band ending at 89.99 must match a mark of exactly 89.99,
// which float arithmetic cannot guarantee.
export function findGradeBand<T extends GradeBand>(
  marks: Prisma.Decimal,
  bands: T[]
): T | null {
  return (
    bands.find(
      (b) => marks.comparedTo(b.minMarks) >= 0 && marks.comparedTo(b.maxMarks) <= 0
    ) ?? null
  );
}
```

- [ ] **Step 4: Run test, verify it passes (6 tests)**

- [ ] **Step 5: Commit** — `git add lib/grade-scale.ts lib/grade-scale.test.ts && git commit -m "Add exact Decimal grade band lookup"`

---

### Task 2: Grade validation

**Files:** create `lib/validation/grade.ts`, test `lib/validation/grade.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/grade.test.ts
import { describe, it, expect } from "vitest";
import { gradeSchema } from "@/lib/validation/grade";

const valid = { enrollmentId: "enr-1", marks: "87.5" };

describe("gradeSchema", () => {
  it("accepts valid marks", () => {
    expect(gradeSchema.safeParse(valid).success).toBe(true);
  });

  it("keeps marks as an exact string", () => {
    const result = gradeSchema.safeParse({ ...valid, marks: "89.99" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.marks).toBe("89.99");
  });

  it("accepts zero marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "0" }).success).toBe(true);
  });

  it("accepts full marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "100" }).success).toBe(true);
  });

  it("rejects marks above 100", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "101" }).success).toBe(false);
  });

  it("rejects negative marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "-1" }).success).toBe(false);
  });

  it("rejects non-numeric marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "abc" }).success).toBe(false);
  });

  it("rejects a missing enrollmentId", () => {
    expect(gradeSchema.safeParse({ ...valid, enrollmentId: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Write lib/validation/grade.ts**

`decimalString` rejects zero (it is built for money), so marks use their own
regex — a mark of 0 is legitimate.

```ts
import { z } from "zod";

export const gradeSchema = z.object({
  enrollmentId: z.string().min(1, "Enrollment is required"),
  // Marks stay a string for the same reason money does: Prisma stores the
  // Decimal exactly, and a JS double would not. Unlike money, zero is valid.
  marks: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Marks must be a number between 0 and 100")
    .refine((v) => Number(v) <= 100, "Marks cannot exceed 100"),
});
```

- [ ] **Step 4: Run test, verify it passes (8 tests)**

- [ ] **Step 5: Commit** — `git commit -m "Add grade validation schema"`

---

### Task 3: Teacher ownership guards and grading action

**Files:** create `lib/teacher-access.ts`, create `lib/actions/grades.ts`

- [ ] **Step 1: Write lib/teacher-access.ts**

```ts
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

// requireRole proves a teacher is calling; it does not prove which sections
// are theirs. Every teacher read and write goes through one of these, so the
// ownership rule lives in exactly one place.
export async function requireTeacherProfile() {
  const session = await requireRole(["TEACHER"]);
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) {
    throw new Error("No teacher profile for this account");
  }
  return { session, teacherId: profile.id };
}

// Returns null rather than throwing so callers can render a friendly banner.
export async function findOwnedSection(sectionId: string, teacherId: string) {
  return prisma.section.findFirst({
    where: { id: sectionId, teacherId },
    select: { id: true },
  });
}

// The enrollmentId arrives from the form, so ownership is resolved by walking
// up to the section rather than trusting the id.
export async function findOwnedEnrollment(enrollmentId: string, teacherId: string) {
  return prisma.enrollment.findFirst({
    where: { id: enrollmentId, section: { teacherId } },
    select: { id: true, sectionId: true, status: true },
  });
}
```

- [ ] **Step 2: Write lib/actions/grades.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { Prisma, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { gradeSchema } from "@/lib/validation/grade";
import { findGradeBand } from "@/lib/grade-scale";
import { requireTeacherProfile, findOwnedEnrollment } from "@/lib/teacher-access";

export async function saveGrade(sectionId: string, formData: FormData) {
  const { session, teacherId } = await requireTeacherProfile();

  const parsed = gradeSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    marks: formData.get("marks"),
  });
  if (!parsed.success) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  // Authorization, not just authentication: a forged enrollmentId belonging to
  // another teacher's section finds nothing here and is rejected.
  const enrollment = await findOwnedEnrollment(parsed.data.enrollmentId, teacherId);
  if (!enrollment) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(
        "That student is not in one of your sections."
      )}`
    );
  }
  if (enrollment.status === EnrollmentStatus.DROPPED) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(
        "That student has dropped this section."
      )}`
    );
  }

  const marks = new Prisma.Decimal(parsed.data.marks);
  const bands = await prisma.gradeScale.findMany({ orderBy: { minMarks: "desc" } });
  const band = findGradeBand(marks, bands);
  if (!band) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(
        `No grade band covers ${parsed.data.marks}. Ask an admin to check the grade scale.`
      )}`
    );
  }

  // Grade is 1:1 with Enrollment, so re-entering marks corrects the existing
  // row rather than creating a second one.
  await prisma.grade.upsert({
    where: { enrollmentId: enrollment.id },
    create: {
      enrollmentId: enrollment.id,
      marks: parsed.data.marks,
      letterGrade: band.letterGrade,
      gradePoint: band.gradePoint,
      gradedBy: session.user.id,
    },
    update: {
      marks: parsed.data.marks,
      letterGrade: band.letterGrade,
      gradePoint: band.gradePoint,
      gradedBy: session.user.id,
      gradedAt: new Date(),
    },
  });

  redirect(`/teacher/sections/${sectionId}`);
}
```

- [ ] **Step 3: `npx tsc --noEmit`**

- [ ] **Step 4: Commit** — `git commit -m "Add teacher ownership guards and grading action"`

---

### Task 4: Teacher overview page

**Files:** replace `app/(dashboard)/teacher/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTeacherProfile } from "@/lib/teacher-access";
import { resolveTermFilter } from "@/lib/term-filter";

export default async function TeacherDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string }>;
}) {
  const { termId } = await searchParams;
  const { teacherId } = await requireTeacherProfile();
  const activeTermId = await resolveTermFilter(termId);

  const [sections, terms] = await Promise.all([
    prisma.section.findMany({
      where: { teacherId, ...(activeTermId ? { termId: activeTermId } : {}) },
      include: {
        subject: true,
        term: true,
        enrollments: {
          where: { status: { not: EnrollmentStatus.DROPPED } },
          select: { grade: { select: { id: true } } },
        },
      },
      orderBy: [{ subject: { code: "asc" } }, { label: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Sections</h1>
      <p className="mb-6 text-sm text-slate-600">
        Sections you teach. Open one to enter marks.
      </p>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/teacher?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/teacher?termId=all"
          className={!activeTermId ? "font-medium text-slate-900" : "text-slate-500"}
        >
          All terms
        </Link>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-slate-500">No sections assigned for this term.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Graded</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const total = s.enrollments.length;
              const graded = s.enrollments.filter((e) => e.grade !== null).length;
              return (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 text-slate-900">
                    {s.subject.code} — {s.subject.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.label}</td>
                  <td className="px-4 py-2 text-slate-600">{s.term.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {graded} / {total}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/teacher/sections/${s.id}`} className="text-slate-600 underline">
                      Enter Marks
                    </Link>
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

- [ ] **Step 3: Commit** — `git commit -m "Add Teacher overview page listing own sections"`

---

### Task 5: Teacher section grading page

**Files:** create `app/(dashboard)/teacher/sections/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTeacherProfile, findOwnedSection } from "@/lib/teacher-access";
import { saveGrade } from "@/lib/actions/grades";

export default async function TeacherSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { teacherId } = await requireTeacherProfile();

  // A section that is not this teacher's is indistinguishable from one that
  // does not exist — no information leaks about other teachers' sections.
  const owned = await findOwnedSection(id, teacherId);
  if (!owned) notFound();

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      subject: true,
      term: true,
      enrollments: {
        include: {
          student: { include: { user: true } },
          grade: true,
        },
        orderBy: { student: { studentId: "asc" } },
      },
    },
  });
  if (!section) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/teacher" className="text-sm text-slate-500 underline">
          ← Back to my sections
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {section.subject.code} — Section {section.label}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {section.subject.name} · {section.term.name}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {section.enrollments.length === 0 ? (
        <p className="text-sm text-slate-500">No students are enrolled in this section.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Student ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Marks</th>
              <th className="px-4 py-2 font-medium">Grade</th>
              <th className="px-4 py-2 font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {section.enrollments.map((e) => {
              const dropped = e.status === EnrollmentStatus.DROPPED;
              return (
                <tr
                  key={e.id}
                  className={`border-t border-slate-200 ${dropped ? "text-slate-400" : ""}`}
                >
                  <td className="px-4 py-2">{e.student.studentId}</td>
                  <td className="px-4 py-2">{e.student.user.name}</td>
                  <td className="px-4 py-2">
                    {dropped ? (
                      "Dropped"
                    ) : (
                      <form
                        action={saveGrade.bind(null, section.id)}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <input
                          name="marks"
                          type="text"
                          inputMode="decimal"
                          defaultValue={e.grade?.marks.toString() ?? ""}
                          placeholder="0–100"
                          required
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Save
                        </button>
                      </form>
                    )}
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

- [ ] **Step 2: Add TEACHER_NAV to app/(dashboard)/layout.tsx**

```tsx
const TEACHER_NAV = [{ href: "/teacher", label: "My Sections" }];
```

and add `TEACHER: TEACHER_NAV` to `NAV_BY_ROLE`.

- [ ] **Step 3: `npx tsc --noEmit && npm run build`**

- [ ] **Step 4: Commit** — `git commit -m "Add Teacher section grading page"`

---

### Task 6: Manual end-to-end verification

- [ ] **Step 1: `npm test`** — expect 100 + 6 (grade-scale) + 8 (grade validation) = **114 across 18 files**.

- [ ] **Step 2:** Log in as `nusrat.jahan@school.edu` / `Passw0rd!`. Expect `/teacher` listing only Dr. Nusrat Jahan's sections, with a graded count, and a "My Sections" nav item.

- [ ] **Step 3:** Open a section. Enter marks `87.5` for a student. Expect letter `A` (or whatever the seeded scale gives) and the matching grade point, both derived.

- [ ] **Step 4 — the boundary check:** Enter `89.99`. Expect it to match the band ending at 89.99 and **not** error with "No grade band covers 89.99". Verify in the database with `marks::text` that the stored value reads exactly `89.99`.

- [ ] **Step 5:** Re-enter different marks for the same student. Expect the grade to update, not duplicate — confirm exactly one `Grade` row for that enrollment.

- [ ] **Step 6:** Enter `101` and `abc`. Expect the validation banners.

- [ ] **Step 7 — the ownership check, the most important one:** while logged in as Dr. Nusrat Jahan, take an `enrollmentId` from a section taught by a *different* teacher (read one from the database) and forge it into the hidden field, then submit. Expect "That student is not in one of your sections." and **no** `Grade` row written for it.

Also navigate directly to `/teacher/sections/<another teacher's section id>`. Expect a 404, not the roster.

- [ ] **Step 8:** Log in as Admin, Manager, and a Student; confirm all three are redirected away from `/teacher`.

- [ ] **Step 9:** Delete the test grades so the database returns to seed state.

---

## Self-Review Notes

- **The ownership rule is enforced in one place** (`lib/teacher-access.ts`) and used by both the page reads and the write action. Step 7 of verification exists specifically to prove the write path is not relying on the UI to restrict access.
- **Decimal discipline:** marks validated as a string, `Prisma.Decimal` for band comparison, string into Prisma, `.toString()` for render. Task 1's 89.99 test is the regression guard for the Phase 2 corruption class.
- **`decimalString` is deliberately not reused** for marks — it rejects zero, which is correct for money and wrong for a mark.
- **Upsert, not create:** `Grade.enrollmentId` is unique, so correcting a grade updates in place; `gradedAt` is refreshed on update so the audit reflects the latest edit.
- **404 over 403** for a foreign section, so the existence of other teachers' sections is not disclosed.
