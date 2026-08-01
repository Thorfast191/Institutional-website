# Phase 3b: Manager Enrollment Oversight and Fees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Manager role with section rosters (audited force-drop) and fee items with payments, where `FeeItem.status` is derived from payment totals using exact Decimal arithmetic.

**Architecture:** Identical to Phases 2 and 3a. Server Components read Prisma directly; every mutation is a Server Action opening with `await requireRole(["MANAGER"])`; forms are plain `<form action={serverAction}>`; errors surface via `redirect("<page>?error=…")`.

**Tech Stack:** Same as Phases 1–3a. No new dependencies.

## Global Constraints

- No REST/tRPC API layer — Server Components + Server Actions only.
- Every Server Action starts with `await requireRole(["MANAGER"])` before touching Prisma.
- **Money never becomes a JS number.** `FeeItem.amount` and `Payment.amount` travel as validated strings into Prisma, and totals are summed with `Prisma.Decimal`, never `Number` / `reduce`. This is the Phase 2 corruption bug applied to money. (Phase 3b spec, The Decimal Rule)
- **`FeeItem.status` is never a form field.** It is recalculated server-side after every payment insert.
- **`droppedBy` and `recordedBy` come from the session**, never from the form. (Phase 2 lesson: client-controlled fields)
- Payment insert + status update happen in one `prisma.$transaction`.
- No schema changes; no deletes in this phase.

## Prerequisites (before Task 1)

1. `main` must be clean: Phase 3a merged, 75 tests across 13 files, `tsc --noEmit` and `next build` green.
2. Create an isolated worktree: `git worktree add .worktrees/phase3b-manager-fees -b phase3b-manager-fees main`, then `cd` into it, `npm install`, `npx prisma generate`, and `cp ../../.env .env` (`.env` is gitignored).
3. Verify the scaffold: `npx tsc --noEmit && npm test` (expect 13 files / 75 tests passing).

---

### Task 1: Decimal field helper

**Files:**
- Modify: `lib/validation/fields.ts`
- Test: `lib/validation/fields.test.ts` (new)

**Interfaces:**
- Produces: `decimalString(label)` — used by Tasks 3 and 5.

Phase 2's `lib/validation/grade-scale.ts` already defines a private `decimalField` helper. This phase needs the same thing twice more, so promote it to the shared field helpers with a positivity rule suited to money.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/fields.test.ts
import { describe, it, expect } from "vitest";
import { decimalString } from "@/lib/validation/fields";

const amount = decimalString("Amount");

describe("decimalString", () => {
  it("accepts a plain integer string", () => {
    expect(amount.safeParse("5000").success).toBe(true);
  });

  it("accepts two decimal places", () => {
    expect(amount.safeParse("5000.50").success).toBe(true);
  });

  it("preserves the exact string rather than converting to a number", () => {
    const result = amount.safeParse("89.99");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("89.99");
  });

  it("rejects zero", () => {
    expect(amount.safeParse("0").success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(amount.safeParse("-10").success).toBe(false);
  });

  it("rejects non-numeric text", () => {
    expect(amount.safeParse("abc").success).toBe(false);
    expect(amount.safeParse("").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/fields.test.ts`
Expected: FAIL — `decimalString` is not exported.

- [ ] **Step 3: Add decimalString to lib/validation/fields.ts**

Append to the existing file:

```ts
// Money stays a string end to end. Routing an amount through
// z.coerce.number() sends it through a JS double, which silently rewrites
// "89.99" as 89.98999999999999 — a real corruption bug this project already
// hit once on GradeScale in Phase 2. Prisma accepts a string for a Decimal
// column directly, so validate the shape and pass it through untouched.
export const decimalString = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, `${label} must be a non-negative number`)
    .refine((v) => Number(v) > 0, `${label} must be greater than zero`);
```

The `Number(v) > 0` comparison is safe: it only decides a boolean, and never becomes the stored value.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/fields.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/validation/fields.ts lib/validation/fields.test.ts
git commit -m "Add shared decimalString validation helper"
```

---

### Task 2: Fee status derivation

**Files:**
- Create: `lib/fee-status.ts`
- Test: `lib/fee-status.test.ts`

**Interfaces:**
- Produces: `deriveFeeStatus(amount: Prisma.Decimal, paid: Prisma.Decimal): FeeStatus`, `sumPayments(amounts: Prisma.Decimal[]): Prisma.Decimal` — used by Task 5.

This is the highest-risk unit in the phase: a fee of 5000.00 paid in three parts must land exactly on `PAID`. `Prisma.Decimal` is decimal.js, so `.plus()` and `.comparedTo()` are exact.

- [ ] **Step 1: Write the failing test**

```ts
// lib/fee-status.test.ts
import { describe, it, expect } from "vitest";
import { Prisma, FeeStatus } from "@prisma/client";
import { deriveFeeStatus, sumPayments } from "@/lib/fee-status";

const d = (v: string) => new Prisma.Decimal(v);

describe("sumPayments", () => {
  it("returns zero for no payments", () => {
    expect(sumPayments([]).toString()).toBe("0");
  });

  it("adds decimals exactly", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floating point; must be "0.3" here.
    expect(sumPayments([d("0.1"), d("0.2")]).toString()).toBe("0.3");
  });

  it("sums a realistic instalment plan exactly", () => {
    expect(sumPayments([d("1500.50"), d("2000.25"), d("1499.25")]).toString()).toBe("5000");
  });
});

describe("deriveFeeStatus", () => {
  it("is UNPAID when nothing has been paid", () => {
    expect(deriveFeeStatus(d("5000"), d("0"))).toBe(FeeStatus.UNPAID);
  });

  it("is PARTIAL when some has been paid", () => {
    expect(deriveFeeStatus(d("5000"), d("1500.50"))).toBe(FeeStatus.PARTIAL);
  });

  it("is PAID on exact payoff", () => {
    expect(deriveFeeStatus(d("5000"), d("5000"))).toBe(FeeStatus.PAID);
  });

  it("is PAID on exact payoff reached in instalments", () => {
    const paid = sumPayments([d("1500.50"), d("2000.25"), d("1499.25")]);
    expect(deriveFeeStatus(d("5000"), paid)).toBe(FeeStatus.PAID);
  });

  it("is PAID on overpayment", () => {
    expect(deriveFeeStatus(d("5000"), d("5500"))).toBe(FeeStatus.PAID);
  });

  it("is PARTIAL one cent short", () => {
    expect(deriveFeeStatus(d("5000"), d("4999.99"))).toBe(FeeStatus.PARTIAL);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/fee-status.test.ts`
Expected: FAIL with "Cannot find module '@/lib/fee-status'"

- [ ] **Step 3: Write lib/fee-status.ts**

```ts
import { Prisma, FeeStatus } from "@prisma/client";

// Prisma.Decimal is decimal.js — .plus() and .comparedTo() are exact, unlike
// the JS number arithmetic that would leave a three-instalment payoff sitting
// at PARTIAL with a 0.0000000001 remainder.
export function sumPayments(amounts: Prisma.Decimal[]): Prisma.Decimal {
  return amounts.reduce((total, a) => total.plus(a), new Prisma.Decimal(0));
}

export function deriveFeeStatus(amount: Prisma.Decimal, paid: Prisma.Decimal): FeeStatus {
  if (paid.comparedTo(0) <= 0) return FeeStatus.UNPAID;
  if (paid.comparedTo(amount) >= 0) return FeeStatus.PAID;
  return FeeStatus.PARTIAL;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/fee-status.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/fee-status.ts lib/fee-status.test.ts
git commit -m "Add exact Decimal fee status derivation"
```

---

### Task 3: Enrollment Server Action (audited force-drop)

**Files:**
- Create: `lib/actions/enrollments.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`
- Produces: `dropEnrollment(id: string, sectionId: string)` — consumed by Task 4.

No validation schema: there is no user-supplied data beyond the two bound ids. The audit fields come from the server.

- [ ] **Step 1: Write lib/actions/enrollments.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

// droppedBy comes from the session, never from the form. A forged audit field
// would make the trail worse than not having one — this is the Phase 2
// client-controlled-role lesson applied to an audit record.
export async function dropEnrollment(id: string, sectionId: string) {
  const session = await requireRole(["MANAGER"]);

  const existing = await prisma.enrollment.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) {
    redirect(
      `/manager/sections/${sectionId}/enrollments?error=${encodeURIComponent(
        "That enrollment no longer exists."
      )}`
    );
  }
  if (existing.status === EnrollmentStatus.DROPPED) {
    redirect(
      `/manager/sections/${sectionId}/enrollments?error=${encodeURIComponent(
        "That enrollment is already dropped."
      )}`
    );
  }

  await prisma.enrollment.update({
    where: { id },
    data: {
      status: EnrollmentStatus.DROPPED,
      droppedAt: new Date(),
      droppedBy: session.user.id,
    },
  });

  redirect(`/manager/sections/${sectionId}/enrollments`);
}
```

- [ ] **Step 2: Confirm session.user.id exists**

Run: `npx tsc --noEmit`
Expected: no errors. If `session.user.id` is not on the session type, check `auth.ts` and `types/next-auth.d.ts` — Phase 1 put `id` and `role` on the session. Do not work around a missing `id` by reading the form.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/enrollments.ts
git commit -m "Add audited force-drop enrollment action"
```

---

### Task 4: Section roster page

**Files:**
- Create: `app/(dashboard)/manager/sections/[id]/enrollments/page.tsx`
- Modify: `app/(dashboard)/manager/sections/[id]/page.tsx` (add a roster link)

**Interfaces:**
- Consumes: `dropEnrollment` (Task 3), `prisma`
- Produces: the roster UI.

- [ ] **Step 1: Write the roster page**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dropEnrollment } from "@/lib/actions/enrollments";

export default async function SectionEnrollmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      subject: true,
      term: true,
      enrollments: {
        include: {
          student: { include: { user: true } },
          droppedByUser: true,
        },
        orderBy: { enrolledAt: "asc" },
      },
    },
  });
  if (!section) notFound();

  const active = section.enrollments.filter((e) => e.status !== EnrollmentStatus.DROPPED);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href={`/manager/sections/${section.id}`} className="text-sm text-slate-500 underline">
          ← Back to section
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Roster — {section.subject.code} Section {section.label}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {section.term.name} · {active.length} enrolled
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {section.enrollments.length === 0 ? (
        <p className="text-sm text-slate-500">No students have enrolled yet.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Student ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Dropped</th>
              <th className="px-4 py-2 font-medium">Actions</th>
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
                  <td className="px-4 py-2">{e.status}</td>
                  <td className="px-4 py-2">
                    {dropped && e.droppedAt
                      ? `${e.droppedAt.toISOString().slice(0, 10)} by ${
                          e.droppedByUser?.name ?? "unknown"
                        }`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {dropped ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <form action={dropEnrollment.bind(null, e.id, section.id)}>
                        <button type="submit" className="text-red-600 underline">
                          Force Drop
                        </button>
                      </form>
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

- [ ] **Step 2: Add a roster link to the section detail page**

In `app/(dashboard)/manager/sections/[id]/page.tsx`, inside the header block, below the `<p>` that shows subject/term/teacher, add:

```tsx
        <Link
          href={`/manager/sections/${section.id}/enrollments`}
          className="mt-2 inline-block text-sm text-slate-600 underline"
        >
          View roster
        </Link>
```

`Link` is already imported in that file.

- [ ] **Step 3: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors. (Stop the dev server first — a concurrent `next build` overwrites `.next`.)

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/manager/sections"
git commit -m "Add section roster page with audited force-drop"
```

---

### Task 5: Fee and payment validation and Server Actions

**Files:**
- Create: `lib/validation/fee.ts`
- Test: `lib/validation/fee.test.ts`
- Create: `lib/actions/fees.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`, `decimalString`/`dateString` (Task 1), `parseDateInput`, `deriveFeeStatus`/`sumPayments` (Task 2)
- Produces: `feeItemSchema`, `paymentSchema`; `createFeeItem(formData)`, `recordPayment(feeItemId, formData)` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/fee.test.ts
import { describe, it, expect } from "vitest";
import { feeItemSchema, paymentSchema } from "@/lib/validation/fee";

const validFee = {
  studentId: "stu-1",
  termId: "term-1",
  feeType: "TUITION",
  amount: "5000.00",
  dueDate: "2026-09-15",
};

const validPayment = {
  amount: "1500.50",
  method: "BANK",
  reference: "TXN-9001",
  paidAt: "2026-08-20",
};

describe("feeItemSchema", () => {
  it("accepts a valid fee item", () => {
    expect(feeItemSchema.safeParse(validFee).success).toBe(true);
  });

  it("keeps the amount as an exact string", () => {
    const result = feeItemSchema.safeParse({ ...validFee, amount: "89.99" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe("89.99");
  });

  it("rejects a feeType outside the enum", () => {
    expect(feeItemSchema.safeParse({ ...validFee, feeType: "PARKING" }).success).toBe(false);
  });

  it("rejects a zero amount", () => {
    expect(feeItemSchema.safeParse({ ...validFee, amount: "0" }).success).toBe(false);
  });

  it("rejects a missing studentId", () => {
    expect(feeItemSchema.safeParse({ ...validFee, studentId: "" }).success).toBe(false);
  });

  it("rejects a malformed due date", () => {
    expect(feeItemSchema.safeParse({ ...validFee, dueDate: "2026-9-15" }).success).toBe(false);
  });
});

describe("paymentSchema", () => {
  it("accepts a valid payment", () => {
    expect(paymentSchema.safeParse(validPayment).success).toBe(true);
  });

  it("accepts a payment with no reference", () => {
    const result = paymentSchema.safeParse({ ...validPayment, reference: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a method outside the enum", () => {
    expect(paymentSchema.safeParse({ ...validPayment, method: "BARTER" }).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(paymentSchema.safeParse({ ...validPayment, amount: "-5" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/fee.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/fee'"

- [ ] **Step 3: Write lib/validation/fee.ts**

```ts
import { z } from "zod";
import { FeeType, PaymentMethod } from "@prisma/client";
import { dateString, decimalString } from "@/lib/validation/fields";

export const feeItemSchema = z.object({
  studentId: z.string().min(1, "Student is required"),
  termId: z.string().min(1, "Term is required"),
  feeType: z.nativeEnum(FeeType, { message: "Fee type is required" }),
  amount: decimalString("Amount"),
  dueDate: dateString("Due date"),
});

// An empty reference field means "no reference", not an invalid one — cash
// payments routinely have none.
export const paymentSchema = z.object({
  amount: decimalString("Amount"),
  method: z.nativeEnum(PaymentMethod, { message: "Payment method is required" }),
  reference: z.string().optional(),
  paidAt: dateString("Payment date"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/fee.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Write lib/actions/fees.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { feeItemSchema, paymentSchema } from "@/lib/validation/fee";
import { parseDateInput } from "@/lib/time";
import { deriveFeeStatus, sumPayments } from "@/lib/fee-status";

export async function createFeeItem(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = feeItemSchema.safeParse({
    studentId: formData.get("studentId"),
    termId: formData.get("termId"),
    feeType: formData.get("feeType"),
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) {
    redirect(`/manager/fees/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const data = parsed.data;
  // amount stays the validated string — Prisma accepts it for a Decimal column
  // and stores it exactly. Never Number(data.amount) here.
  await prisma.feeItem.create({
    data: {
      studentId: data.studentId,
      termId: data.termId,
      feeType: data.feeType,
      amount: data.amount,
      dueDate: parseDateInput(data.dueDate),
    },
  });

  redirect("/manager/fees");
}

export async function recordPayment(feeItemId: string, formData: FormData) {
  const session = await requireRole(["MANAGER"]);

  const parsed = paymentSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference"),
    paidAt: formData.get("paidAt"),
  });
  if (!parsed.success) {
    redirect(
      `/manager/fees/${feeItemId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const feeItem = await prisma.feeItem.findUnique({
    where: { id: feeItemId },
    select: { amount: true },
  });
  if (!feeItem) {
    redirect(`/manager/fees?error=${encodeURIComponent("That fee item no longer exists.")}`);
  }

  const data = parsed.data;

  // The insert and the derived-status update are one transaction: a crash
  // between them would leave a recorded payment against a stale status.
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        feeItemId,
        amount: data.amount,
        method: data.method,
        reference: data.reference && data.reference.length > 0 ? data.reference : null,
        paidAt: parseDateInput(data.paidAt),
        recordedBy: session.user.id,
      },
    });

    const payments = await tx.payment.findMany({
      where: { feeItemId },
      select: { amount: true },
    });

    await tx.feeItem.update({
      where: { id: feeItemId },
      data: { status: deriveFeeStatus(feeItem.amount, sumPayments(payments.map((p) => p.amount))) },
    });
  });

  redirect(`/manager/fees/${feeItemId}`);
}
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/fee.ts lib/validation/fee.test.ts lib/actions/fees.ts
git commit -m "Add fee item and payment validation and Server Actions"
```

---

### Task 6: Fee list and create pages

**Files:**
- Create: `app/(dashboard)/manager/fees/page.tsx`
- Create: `app/(dashboard)/manager/fees/new/page.tsx`

**Interfaces:**
- Consumes: `createFeeItem` (Task 5), `resolveTermFilter`, `formatDateInput`, `prisma`
- Produces: `/manager/fees` list with term filter, and the create form.

- [ ] **Step 1: Write app/(dashboard)/manager/fees/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveTermFilter } from "@/lib/term-filter";
import { formatDateInput } from "@/lib/time";
import { sumPayments } from "@/lib/fee-status";

const STATUS_CLASS: Record<string, string> = {
  PAID: "text-green-700",
  PARTIAL: "text-amber-700",
  UNPAID: "text-red-700",
};

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; termId?: string }>;
}) {
  const { error, termId } = await searchParams;
  const activeTermId = await resolveTermFilter(termId);

  const [feeItems, terms] = await Promise.all([
    prisma.feeItem.findMany({
      where: activeTermId ? { termId: activeTermId } : undefined,
      include: {
        student: { include: { user: true } },
        term: true,
        payments: { select: { amount: true } },
      },
      orderBy: [{ dueDate: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Fees</h1>
        <Link
          href="/manager/fees/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Fee Item
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/manager/fees?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/manager/fees?termId=all"
          className={!activeTermId ? "font-medium text-slate-900" : "text-slate-500"}
        >
          All terms
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Student</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Paid</th>
            <th className="px-4 py-2 font-medium">Due</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {feeItems.map((f) => {
            const paid = sumPayments(f.payments.map((p) => p.amount));
            return (
              <tr key={f.id} className="border-t border-slate-200">
                <td className="px-4 py-2 text-slate-900">
                  {f.student.user.name} ({f.student.studentId})
                </td>
                <td className="px-4 py-2 text-slate-600">{f.feeType}</td>
                <td className="px-4 py-2 text-slate-600">{f.amount.toString()}</td>
                <td className="px-4 py-2 text-slate-600">{paid.toString()}</td>
                <td className="px-4 py-2 text-slate-600">{formatDateInput(f.dueDate)}</td>
                <td className={`px-4 py-2 font-medium ${STATUS_CLASS[f.status] ?? ""}`}>
                  {f.status}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/manager/fees/${f.id}`} className="text-slate-600 underline">
                    Payments
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

Note `f.amount.toString()` and `paid.toString()` — Decimals are rendered as strings, never interpolated as numbers.

- [ ] **Step 2: Write app/(dashboard)/manager/fees/new/page.tsx**

```tsx
import { FeeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createFeeItem } from "@/lib/actions/fees";

const FEE_TYPES: FeeType[] = [
  FeeType.TUITION,
  FeeType.LAB,
  FeeType.LIBRARY,
  FeeType.EXAM,
  FeeType.OTHER,
];

export default async function NewFeeItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [students, terms] = await Promise.all([
    prisma.studentProfile.findMany({
      include: { user: true },
      orderBy: { studentId: "asc" },
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Fee Item</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createFeeItem} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="studentId">
          Student
        </label>
        <select
          id="studentId"
          name="studentId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.user.name} ({s.studentId})
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="termId">
          Term
        </label>
        <select
          id="termId"
          name="termId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="feeType">
          Fee Type
        </label>
        <select
          id="feeType"
          name="feeType"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {FEE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="amount">
          Amount
        </label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="5000.00"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="dueDate">
          Due Date
        </label>
        <input
          id="dueDate"
          name="dueDate"
          type="date"
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create
        </button>
      </form>
    </div>
  );
}
```

The amount field is `type="text"` with `inputMode="decimal"`, not `type="number"`. A number input hands back a browser-normalised value and invites the float round trip this phase exists to avoid.

- [ ] **Step 3: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/manager/fees"
git commit -m "Add fee item list and create pages"
```

---

### Task 7: Fee detail page with payment history

**Files:**
- Create: `app/(dashboard)/manager/fees/[id]/page.tsx`

**Interfaces:**
- Consumes: `recordPayment` (Task 5), `sumPayments` (Task 2), `formatDateInput`, `prisma`
- Produces: payment history plus the record-a-payment form.

- [ ] **Step 1: Write the page**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordPayment } from "@/lib/actions/fees";
import { formatDateInput } from "@/lib/time";
import { sumPayments } from "@/lib/fee-status";

const METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.BANK,
  PaymentMethod.ONLINE,
  PaymentMethod.OTHER,
];

export default async function FeeItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const feeItem = await prisma.feeItem.findUnique({
    where: { id },
    include: {
      student: { include: { user: true } },
      term: true,
      payments: {
        include: { recordedByUser: true },
        orderBy: { paidAt: "asc" },
      },
    },
  });
  if (!feeItem) notFound();

  const paid = sumPayments(feeItem.payments.map((p) => p.amount));
  const outstanding = feeItem.amount.minus(paid);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/manager/fees" className="text-sm text-slate-500 underline">
          ← Back to fees
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {feeItem.feeType} — {feeItem.student.user.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {feeItem.term.name} · due {formatDateInput(feeItem.dueDate)} · {feeItem.status}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Amount</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{feeItem.amount.toString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Paid</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{paid.toString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Outstanding</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {outstanding.comparedTo(0) > 0 ? outstanding.toString() : "0"}
          </p>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-medium text-slate-900">Payment History</h2>
      {feeItem.payments.length === 0 ? (
        <p className="mb-6 text-sm text-slate-500">No payments recorded yet.</p>
      ) : (
        <table className="mb-6 w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Method</th>
              <th className="px-4 py-2 font-medium">Reference</th>
              <th className="px-4 py-2 font-medium">Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {feeItem.payments.map((p) => (
              <tr key={p.id} className="border-t border-slate-200">
                <td className="px-4 py-2 text-slate-600">{formatDateInput(p.paidAt)}</td>
                <td className="px-4 py-2 text-slate-900">{p.amount.toString()}</td>
                <td className="px-4 py-2 text-slate-600">{p.method}</td>
                <td className="px-4 py-2 text-slate-600">{p.reference ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{p.recordedByUser.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-3 text-lg font-medium text-slate-900">Record a Payment</h2>
      <form
        action={recordPayment.bind(null, feeItem.id)}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="method"
          defaultValue={PaymentMethod.CASH}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          name="reference"
          placeholder="Reference (optional)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="paidAt"
          type="date"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Record
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/manager/fees"
git commit -m "Add fee item detail page with payment history"
```

---

### Task 8: Manager nav and overview additions

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/manager/page.tsx`

- [ ] **Step 1: Add Fees to MANAGER_NAV**

In `app/(dashboard)/layout.tsx`, append to `MANAGER_NAV`:

```tsx
  { href: "/manager/fees", label: "Fees" },
```

- [ ] **Step 2: Add an unpaid-fees card to the Manager overview**

In `app/(dashboard)/manager/page.tsx`, add to the `Promise.all` destructuring and array:

```tsx
    prisma.feeItem.count({ where: { status: { not: "PAID" } } }),
```

bound to a new `unpaidCount`, and append to `cards`:

```tsx
    { label: "Unpaid Fees", count: unpaidCount, href: "/manager/fees" },
```

Change the grid to `sm:grid-cols-5` so five cards lay out evenly.

- [ ] **Step 3: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx" "app/(dashboard)/manager/page.tsx"
git commit -m "Add Fees to Manager nav and overview"
```

---

### Task 9: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: Phase 3a ended at 75 tests / 13 files; this phase adds 6 (fields) + 9 (fee-status) + 10 (fee validation) = 25, for **100 total across 16 files**.

- [ ] **Step 2: Log in as Manager and check the overview**

Run `npm run dev`, log in with `manager@school.edu` / `Passw0rd!`.
Expected: nav shows Overview / Terms / Subjects / Sections / Exams / Fees; five cards including Unpaid Fees.

- [ ] **Step 3: Section roster and the force-drop audit**

Open a seeded section → "View roster". Expected: enrolled students listed with their student IDs.

Force-drop one. Expected: the row greys out, status reads DROPPED, and the Dropped column shows today's date "by Farhan Kabir" — the logged-in Manager's name, proving `droppedBy` came from the session.

Verify directly in the database that `droppedAt` is set and `droppedBy` equals the Manager's user id.

Force-drop the same row again by resubmitting. Expected: "That enrollment is already dropped."

Restore the row to `ENROLLED` with `droppedAt`/`droppedBy` cleared, via a direct database update, so the seed state is preserved.

- [ ] **Step 4: Create a fee item**

Create one: any student / Summer 2026 / TUITION / **5000.00** / due 2026-09-15. Expected: appears in the list with Amount 5000, Paid 0, status UNPAID.

Try amount `0` and amount `abc`. Expected: "Amount must be greater than zero" and "Amount must be a non-negative number".

- [ ] **Step 5: The instalment payoff — the critical check**

Open the fee item. Record three payments: **1500.50** (BANK, ref TXN-1), **2000.25** (ONLINE, ref TXN-2), **1499.25** (CASH, no reference).

Expected after each:
1. Paid 1500.5, Outstanding 3499.5, status **PARTIAL**
2. Paid 3500.75, Outstanding 1499.25, status **PARTIAL**
3. Paid 5000, Outstanding 0, status **PAID**

The third is the one that matters: a float implementation lands at 5000.000000000001 or 4999.999999999999 and either way the assertion that status is exactly `PAID` is what catches it.

Then verify in the database with raw SQL that `amount::text` reads exactly `5000.00` and the payment amounts read `1500.50` / `2000.25` / `1499.25` — no trailing float noise. This is the same check that caught the Phase 2 GradeScale corruption.

Confirm each payment row shows "Farhan Kabir" as Recorded By, and the CASH row shows "—" for reference.

- [ ] **Step 6: Term filter**

Confirm `/manager/fees` defaults to the active term and that the term switcher and "All terms" behave as on Sections and Exams.

- [ ] **Step 7: Cross-role regression check**

Log in as Admin, Teacher, and a Student. Expected: all three are redirected away from `/manager/fees`, and only Admin sees a nav bar.

- [ ] **Step 8: Restore seed state**

Delete the test payments and the test fee item directly in the database, and confirm the roster row restored in Step 3 is back to `ENROLLED`.

- [ ] **Step 9: Final commit**

If Steps 1–8 required fixes, commit them. Otherwise a no-op.

---

## Self-Review Notes

- **Spec coverage:** enrollment oversight with audit (Tasks 3/4), fee items (5/6), payments with derived status (5/7), nav and overview (8). Non-goals honoured: no refunds, no bulk generation, no student self-service, no overpayment block, no deletes.
- **The Decimal rule is enforced at four points:** `decimalString` validation (Task 1), string passed to Prisma unchanged (Task 5), `Prisma.Decimal` summation (Task 2), `.toString()` rendering (Tasks 6/7). Task 9 Step 5 verifies all four at once against the database.
- **Server-derived fields:** `FeeItem.status`, `Payment.recordedBy`, `Enrollment.droppedBy`, and `Enrollment.droppedAt` appear in no schema and no form. Each is written from the session or computed.
- **Transaction boundary:** the payment insert and status update are one `$transaction` callback, so the derived status can never lag the payments it derives from.
- **`type="text" inputMode="decimal"`** on both amount inputs rather than `type="number"` — a deliberate choice to keep the browser from normalising the value before it reaches the server.
- **Known risk:** `recordPayment` reads `feeItem.amount` before the transaction opens, so two concurrent payments could each compute status against a stale payment set. For a single-Manager institutional back office this is acceptable; the correct fix, if concurrency ever matters, is to move the `findUnique` inside the transaction with a row lock. Recorded here rather than silently ignored.
