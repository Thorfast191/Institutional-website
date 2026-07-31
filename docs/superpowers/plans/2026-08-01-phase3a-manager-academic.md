# Phase 3a: Manager Academic Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Manager full CRUD over Terms, Subjects, Sections, Routines, and Exams — the academic scaffolding Phase 4's grading and Phase 5's student registration both build on — replacing the bare `/manager` placeholder with working screens.

**Architecture:** Identical to Phase 2. Server Components read Prisma directly; every mutation is a Server Action opening with `await requireRole(["MANAGER"])`; forms are plain `<form action={serverAction}>` with no client JS; errors surface as a banner via `redirect("<page>?error=…")`. Sections and Exams lists filter by term via a `?termId=` searchParam, defaulting to the active term — the same pattern `?role=` already uses on `/admin/users`.

**Tech Stack:** Same as Phases 1–2 — Next.js 15 App Router + TypeScript, Prisma 6, zod, Vitest. No new dependencies.

## Global Constraints

- No REST/tRPC API layer — Server Components + Server Actions only. (Phase 1 spec, still in force)
- No cascading deletes — all relations remain `Restrict`. (Phase 1 spec)
- Every Server Action starts with `await requireRole(["MANAGER"])` before touching Prisma.
- Errors are surfaced via `redirect("<page>?error=<message>")` banners, not per-field inline state.
- No schema changes — every field already exists from Phase 1's `prisma/schema.prisma`.
- **No scheduling conflict detection.** Overlapping Routines (same teacher or same room) are allowed. (Phase 3a spec, Non-Goals)
- **`isActive` is never an editable form field.** It changes only through the dedicated Set Active action. (Phase 3a spec)
- **All date/time conversion goes through `lib/time.ts` using UTC explicitly.** Never parse `"09:30"` or `"2026-08-15"` with local-time constructors. The Phase 1 seed already stores times as `new Date("1970-01-01T09:00:00Z")`; this convention matches it.
- No Decimal fields in this phase (`Subject.credits` is an `Int`), so Phase 2's decimal-as-string rule does not apply — it will in Phase 3b.

## Prerequisites (before Task 1)

1. `main` must build and test clean (Phase 2 merged: 32 tests, `tsc --noEmit` and `next build` green).
2. Create an isolated worktree: `git worktree add .worktrees/phase3a-manager-academic -b phase3a-manager-academic main`, then `cd` into it, `npm install`, `npx prisma generate`, and copy `.env` from the main worktree (`.env` is gitignored): `cp ../../.env .env`.
3. Verify the scaffold: `npx tsc --noEmit && npm test` (expect 7 files / 32 tests passing).

---

### Task 1: Shared Prisma error helpers

**Files:**
- Create: `lib/prisma-errors.ts`
- Modify: `lib/actions/departments.ts`, `lib/actions/programs.ts`, `lib/actions/users.ts`

**Interfaces:**
- Consumes: `Prisma` from `@prisma/client`
- Produces: `isUniqueConstraintError(error: unknown): boolean`, `isRestrictConstraintError(error: unknown): boolean` — imported by every action file in Tasks 3, 5, 7, 9, 11.

Phase 2 copy-pasted these two predicates into three action files. Phase 3a would take that to eight. Extract once, then update the existing call sites.

- [ ] **Step 1: Create lib/prisma-errors.ts**

```ts
import { Prisma } from "@prisma/client";

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isRestrictConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2003" || error.code === "P2014")
  );
}
```

- [ ] **Step 2: Update lib/actions/departments.ts**

Delete the two local function definitions (the `function isUniqueConstraintError…` and `function isRestrictConstraintError…` blocks near the top) and the now-unused `import { Prisma } from "@prisma/client";` line. Add this import alongside the existing ones:

```ts
import { isUniqueConstraintError, isRestrictConstraintError } from "@/lib/prisma-errors";
```

Leave every call site unchanged — the names are identical.

- [ ] **Step 3: Update lib/actions/programs.ts**

Same edit as Step 2: delete both local predicates and the `Prisma` import, then add:

```ts
import { isUniqueConstraintError, isRestrictConstraintError } from "@/lib/prisma-errors";
```

- [ ] **Step 4: Update lib/actions/users.ts**

This file defines only `isUniqueConstraintError`. Delete it and the `Prisma` import, then add:

```ts
import { isUniqueConstraintError } from "@/lib/prisma-errors";
```

- [ ] **Step 5: Verify nothing broke**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, 32 tests still passing. This is a pure refactor — the count must not change.

- [ ] **Step 6: Commit**

```bash
git add lib/prisma-errors.ts lib/actions/departments.ts lib/actions/programs.ts lib/actions/users.ts
git commit -m "Extract shared Prisma constraint-error helpers"
```

---

### Task 2: Date and time conversion helpers

**Files:**
- Create: `lib/time.ts`
- Test: `lib/time.test.ts`

**Interfaces:**
- Produces: `parseTimeInput(value: string): Date`, `formatTimeInput(value: Date): string`, `parseDateInput(value: string): Date`, `formatDateInput(value: Date): string` — used by Tasks 3, 4, 9, 10, 11, 12.

`Routine.startTime`/`endTime` are `@db.Time`, `Exam.date` is `@db.Date`, and `Term`'s four date columns are `DateTime`. HTML inputs submit strings. Every conversion pins UTC explicitly, because parsing these as local time silently shifts stored data for anyone outside UTC.

- [ ] **Step 1: Write the failing test**

```ts
// lib/time.test.ts
import { describe, it, expect } from "vitest";
import { parseTimeInput, formatTimeInput, parseDateInput, formatDateInput } from "@/lib/time";

describe("parseTimeInput", () => {
  it("parses a time onto the 1970-01-01 UTC epoch date", () => {
    expect(parseTimeInput("09:30").toISOString()).toBe("1970-01-01T09:30:00.000Z");
  });

  it("handles midnight", () => {
    expect(parseTimeInput("00:00").toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("handles the last minute of the day", () => {
    expect(parseTimeInput("23:59").toISOString()).toBe("1970-01-01T23:59:00.000Z");
  });

  it("rejects a malformed time", () => {
    expect(() => parseTimeInput("9:30")).toThrow();
    expect(() => parseTimeInput("24:00")).toThrow();
    expect(() => parseTimeInput("")).toThrow();
  });
});

describe("formatTimeInput", () => {
  it("formats using UTC, not local time", () => {
    expect(formatTimeInput(new Date("1970-01-01T09:30:00Z"))).toBe("09:30");
  });

  it("zero-pads", () => {
    expect(formatTimeInput(new Date("1970-01-01T07:05:00Z"))).toBe("07:05");
  });

  it("round-trips with parseTimeInput", () => {
    for (const value of ["00:00", "07:05", "09:30", "12:00", "23:59"]) {
      expect(formatTimeInput(parseTimeInput(value))).toBe(value);
    }
  });
});

describe("parseDateInput", () => {
  it("parses to UTC midnight", () => {
    expect(parseDateInput("2026-08-15").toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("rejects a malformed date", () => {
    expect(() => parseDateInput("2026-8-15")).toThrow();
    expect(() => parseDateInput("")).toThrow();
  });
});

describe("formatDateInput", () => {
  it("formats using UTC, not local time", () => {
    expect(formatDateInput(new Date("2026-08-15T00:00:00Z"))).toBe("2026-08-15");
  });

  it("round-trips with parseDateInput", () => {
    for (const value of ["2026-01-01", "2026-08-15", "2026-12-31"]) {
      expect(formatDateInput(parseDateInput(value))).toBe(value);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/time.test.ts`
Expected: FAIL with "Cannot find module '@/lib/time'"

- [ ] **Step 3: Write lib/time.ts**

```ts
// HTML date and time inputs submit strings; the matching Prisma columns are
// DateTime / @db.Time / @db.Date. Every conversion here pins UTC explicitly —
// parsing "09:30" or "2026-08-15" with a local-time constructor shifts the
// stored value for anyone outside UTC, and the bug is invisible in a UTC
// developer environment. The Phase 1 seed already writes times as
// new Date("1970-01-01T09:00:00Z"), which this matches.

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseTimeInput(value: string): Date {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid time input: ${value}`);
  }
  return new Date(`1970-01-01T${match[1]}:${match[2]}:00Z`);
}

export function formatTimeInput(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function parseDateInput(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`Invalid date input: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${value}`);
  }
  return parsed;
}

export function formatDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/time.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/time.ts lib/time.test.ts
git commit -m "Add UTC-pinned date and time input helpers"
```

---

### Task 3: Shared validation field helpers + Term validation and actions

**Files:**
- Create: `lib/validation/fields.ts`
- Create: `lib/validation/term.ts`
- Test: `lib/validation/term.test.ts`
- Create: `lib/actions/terms.ts`

**Interfaces:**
- Consumes: `requireRole` (Phase 2), `prisma`, `parseDateInput` (Task 2), `isRestrictConstraintError` (Task 1)
- Produces: `dateString(label)`, `timeString(label)`, `positiveInt(label)` from `lib/validation/fields.ts` (used by Tasks 5, 9, 11); `termSchema`; `createTerm(formData)`, `updateTerm(id, formData)`, `deleteTerm(id)`, `setActiveTerm(id)` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/term.test.ts
import { describe, it, expect } from "vitest";
import { termSchema } from "@/lib/validation/term";

const valid = {
  name: "Fall 2026",
  startDate: "2026-09-01",
  endDate: "2026-12-20",
  registrationOpensAt: "2026-08-01",
  registrationClosesAt: "2026-08-25",
};

describe("termSchema", () => {
  it("accepts a valid term", () => {
    expect(termSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(termSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = termSchema.safeParse({ ...valid, endDate: "2026-08-01" });
    expect(result.success).toBe(false);
  });

  it("rejects an end date equal to the start date", () => {
    const result = termSchema.safeParse({ ...valid, endDate: valid.startDate });
    expect(result.success).toBe(false);
  });

  it("rejects a registration window that closes before it opens", () => {
    const result = termSchema.safeParse({ ...valid, registrationClosesAt: "2026-07-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(termSchema.safeParse({ ...valid, startDate: "2026-9-1" }).success).toBe(false);
  });

  it("allows a registration window outside the term dates", () => {
    // Registration opening months before the term starts is normal and stays unconstrained.
    const result = termSchema.safeParse({ ...valid, registrationOpensAt: "2026-01-01" });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/term.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/term'"

- [ ] **Step 3: Write lib/validation/fields.ts**

```ts
import { z } from "zod";

// ISO date strings ("2026-08-15") and 24-hour times ("09:30") compare
// lexicographically in the same order they compare chronologically, so the
// cross-field "after" rules can operate on the raw strings without parsing.
export const dateString = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`);

export const timeString = (label: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a valid time`);

export const positiveInt = (label: string) =>
  z.coerce
    .number()
    .int(`${label} must be a whole number`)
    .min(1, `${label} must be at least 1`);
```

- [ ] **Step 4: Write lib/validation/term.ts**

```ts
import { z } from "zod";
import { dateString } from "@/lib/validation/fields";

export const termSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    startDate: dateString("Start date"),
    endDate: dateString("End date"),
    registrationOpensAt: dateString("Registration opening date"),
    registrationClosesAt: dateString("Registration closing date"),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  })
  .refine((data) => data.registrationClosesAt > data.registrationOpensAt, {
    message: "Registration must close after it opens",
    path: ["registrationClosesAt"],
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/validation/term.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Write lib/actions/terms.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { termSchema } from "@/lib/validation/term";
import { parseDateInput } from "@/lib/time";
import { isRestrictConstraintError } from "@/lib/prisma-errors";

function readTermForm(formData: FormData) {
  return {
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    registrationOpensAt: formData.get("registrationOpensAt"),
    registrationClosesAt: formData.get("registrationClosesAt"),
  };
}

function toTermData(data: {
  name: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
}) {
  return {
    name: data.name,
    startDate: parseDateInput(data.startDate),
    endDate: parseDateInput(data.endDate),
    registrationOpensAt: parseDateInput(data.registrationOpensAt),
    registrationClosesAt: parseDateInput(data.registrationClosesAt),
  };
}

export async function createTerm(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = termSchema.safeParse(readTermForm(formData));
  if (!parsed.success) {
    redirect(`/manager/terms/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  await prisma.term.create({ data: toTermData(parsed.data) });
  redirect("/manager/terms");
}

export async function updateTerm(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = termSchema.safeParse(readTermForm(formData));
  if (!parsed.success) {
    redirect(`/manager/terms/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  await prisma.term.update({ where: { id }, data: toTermData(parsed.data) });
  redirect("/manager/terms");
}

export async function deleteTerm(id: string) {
  await requireRole(["MANAGER"]);

  try {
    await prisma.term.delete({ where: { id } });
  } catch (error) {
    if (isRestrictConstraintError(error)) {
      redirect(
        `/manager/terms?error=${encodeURIComponent(
          "Cannot delete — one or more sections, exams, or fee items still reference this term."
        )}`
      );
    }
    throw error;
  }

  redirect("/manager/terms");
}

// Phase 1 requires exactly one active Term. Flipping the chosen term on and
// every other term off in a single transaction enforces that structurally, so
// there is no error state to explain and no window with zero active terms.
export async function setActiveTerm(id: string) {
  await requireRole(["MANAGER"]);

  await prisma.$transaction([
    prisma.term.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.term.update({ where: { id }, data: { isActive: true } }),
  ]);

  redirect("/manager/terms");
}
```

- [ ] **Step 7: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/validation/fields.ts lib/validation/term.ts lib/validation/term.test.ts lib/actions/terms.ts
git commit -m "Add Term validation schema and Server Actions"
```

---

### Task 4: Term pages

**Files:**
- Create: `app/(dashboard)/manager/terms/page.tsx`
- Create: `app/(dashboard)/manager/terms/new/page.tsx`
- Create: `app/(dashboard)/manager/terms/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createTerm`, `updateTerm`, `deleteTerm`, `setActiveTerm` (Task 3), `formatDateInput` (Task 2), `prisma`
- Produces: working `/manager/terms` CRUD UI. Establishes the list/new/edit page shape Tasks 6, 8, and 12 copy.

- [ ] **Step 1: Write app/(dashboard)/manager/terms/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteTerm, setActiveTerm } from "@/lib/actions/terms";
import { formatDateInput } from "@/lib/time";

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const terms = await prisma.term.findMany({ orderBy: { startDate: "desc" } });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Terms</h1>
        <Link
          href="/manager/terms/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Term
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Dates</th>
            <th className="px-4 py-2 font-medium">Registration</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{t.name}</td>
              <td className="px-4 py-2 text-slate-600">
                {formatDateInput(t.startDate)} – {formatDateInput(t.endDate)}
              </td>
              <td className="px-4 py-2 text-slate-600">
                {formatDateInput(t.registrationOpensAt)} – {formatDateInput(t.registrationClosesAt)}
              </td>
              <td className="px-4 py-2">
                {t.isActive ? (
                  <span className="font-medium text-green-700">Active</span>
                ) : (
                  <form action={setActiveTerm.bind(null, t.id)}>
                    <button type="submit" className="text-slate-600 underline">
                      Set Active
                    </button>
                  </form>
                )}
              </td>
              <td className="px-4 py-2">
                <Link href={`/manager/terms/${t.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteTerm.bind(null, t.id)} className="inline">
                  <button type="submit" className="ml-3 text-red-600 underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write app/(dashboard)/manager/terms/new/page.tsx**

```tsx
import { createTerm } from "@/lib/actions/terms";

export default async function NewTermPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Term</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createTerm} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="startDate">
          Start Date
        </label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="endDate">
          End Date
        </label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="registrationOpensAt"
        >
          Registration Opens
        </label>
        <input
          id="registrationOpensAt"
          name="registrationOpensAt"
          type="date"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="registrationClosesAt"
        >
          Registration Closes
        </label>
        <input
          id="registrationClosesAt"
          name="registrationClosesAt"
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

- [ ] **Step 3: Write app/(dashboard)/manager/terms/[id]/edit/page.tsx**

Identical field set to Step 2, with `defaultValue` on each input and the bound action. `isActive` is deliberately absent — it changes only via Set Active.

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateTerm } from "@/lib/actions/terms";
import { formatDateInput } from "@/lib/time";

export default async function EditTermPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const term = await prisma.term.findUnique({ where: { id } });
  if (!term) notFound();

  const updateWithId = updateTerm.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Term</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={term.name}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="startDate">
          Start Date
        </label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={formatDateInput(term.startDate)}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="endDate">
          End Date
        </label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          defaultValue={formatDateInput(term.endDate)}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="registrationOpensAt"
        >
          Registration Opens
        </label>
        <input
          id="registrationOpensAt"
          name="registrationOpensAt"
          type="date"
          defaultValue={formatDateInput(term.registrationOpensAt)}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label
          className="mb-1 block text-sm font-medium text-slate-700"
          htmlFor="registrationClosesAt"
        >
          Registration Closes
        </label>
        <input
          id="registrationClosesAt"
          name="registrationClosesAt"
          type="date"
          defaultValue={formatDateInput(term.registrationClosesAt)}
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors. (Stop the dev server first if one is running — a concurrent `next build` overwrites `.next` and breaks the running server's chunk cache.)

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/manager/terms"
git commit -m "Add Term list/create/edit/delete pages with Set Active"
```

---

### Task 5: Subject validation and Server Actions

**Files:**
- Create: `lib/validation/subject.ts`
- Test: `lib/validation/subject.test.ts`
- Create: `lib/actions/subjects.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`, `positiveInt` (Task 3), `isUniqueConstraintError`/`isRestrictConstraintError` (Task 1)
- Produces: `subjectSchema`; `createSubject(formData)`, `updateSubject(id, formData)`, `deleteSubject(id)` — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/subject.test.ts
import { describe, it, expect } from "vitest";
import { subjectSchema } from "@/lib/validation/subject";

const valid = { name: "Structured Programming", code: "CSE101", credits: "3", programId: "prog-1" };

describe("subjectSchema", () => {
  it("accepts a valid subject", () => {
    expect(subjectSchema.safeParse(valid).success).toBe(true);
  });

  it("coerces credits from the form string to a number", () => {
    const result = subjectSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.credits).toBe(3);
  });

  it("rejects an empty name", () => {
    expect(subjectSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects an empty code", () => {
    expect(subjectSchema.safeParse({ ...valid, code: "" }).success).toBe(false);
  });

  it("rejects a missing programId", () => {
    expect(subjectSchema.safeParse({ ...valid, programId: "" }).success).toBe(false);
  });

  it("rejects zero or fractional credits", () => {
    expect(subjectSchema.safeParse({ ...valid, credits: "0" }).success).toBe(false);
    expect(subjectSchema.safeParse({ ...valid, credits: "1.5" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/subject.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/subject'"

- [ ] **Step 3: Write lib/validation/subject.ts**

```ts
import { z } from "zod";
import { positiveInt } from "@/lib/validation/fields";

export const subjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  credits: positiveInt("Credits"),
  programId: z.string().min(1, "Program is required"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/subject.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write lib/actions/subjects.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { subjectSchema } from "@/lib/validation/subject";
import { isUniqueConstraintError, isRestrictConstraintError } from "@/lib/prisma-errors";

function readSubjectForm(formData: FormData) {
  return {
    name: formData.get("name"),
    code: formData.get("code"),
    credits: formData.get("credits"),
    programId: formData.get("programId"),
  };
}

export async function createSubject(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = subjectSchema.safeParse(readSubjectForm(formData));
  if (!parsed.success) {
    redirect(`/manager/subjects/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.subject.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/subjects/new?error=${encodeURIComponent("Subject code already in use.")}`);
    }
    throw error;
  }

  redirect("/manager/subjects");
}

export async function updateSubject(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = subjectSchema.safeParse(readSubjectForm(formData));
  if (!parsed.success) {
    redirect(`/manager/subjects/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.subject.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/subjects/${id}/edit?error=${encodeURIComponent("Subject code already in use.")}`);
    }
    throw error;
  }

  redirect("/manager/subjects");
}

export async function deleteSubject(id: string) {
  await requireRole(["MANAGER"]);

  try {
    await prisma.subject.delete({ where: { id } });
  } catch (error) {
    if (isRestrictConstraintError(error)) {
      redirect(
        `/manager/subjects?error=${encodeURIComponent(
          "Cannot delete — one or more sections or exams still reference this subject."
        )}`
      );
    }
    throw error;
  }

  redirect("/manager/subjects");
}
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/subject.ts lib/validation/subject.test.ts lib/actions/subjects.ts
git commit -m "Add Subject validation schema and Server Actions"
```

---

### Task 6: Subject pages

**Files:**
- Create: `app/(dashboard)/manager/subjects/page.tsx`
- Create: `app/(dashboard)/manager/subjects/new/page.tsx`
- Create: `app/(dashboard)/manager/subjects/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createSubject`, `updateSubject`, `deleteSubject` (Task 5), `prisma`
- Produces: working `/manager/subjects` CRUD UI.

- [ ] **Step 1: Write app/(dashboard)/manager/subjects/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteSubject } from "@/lib/actions/subjects";

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const subjects = await prisma.subject.findMany({
    include: { program: true },
    orderBy: { code: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Subjects</h1>
        <Link
          href="/manager/subjects/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Subject
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Code</th>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Credits</th>
            <th className="px-4 py-2 font-medium">Program</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{s.code}</td>
              <td className="px-4 py-2 text-slate-600">{s.name}</td>
              <td className="px-4 py-2 text-slate-600">{s.credits}</td>
              <td className="px-4 py-2 text-slate-600">{s.program.name}</td>
              <td className="px-4 py-2">
                <Link href={`/manager/subjects/${s.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteSubject.bind(null, s.id)} className="inline">
                  <button type="submit" className="ml-3 text-red-600 underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write app/(dashboard)/manager/subjects/new/page.tsx**

```tsx
import { prisma } from "@/lib/prisma";
import { createSubject } from "@/lib/actions/subjects";

export default async function NewSubjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const programs = await prisma.program.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Subject</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createSubject} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="credits">
          Credits
        </label>
        <input
          id="credits"
          name="credits"
          type="number"
          min="1"
          step="1"
          defaultValue="3"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="programId">
          Program
        </label>
        <select
          id="programId"
          name="programId"
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a program</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

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

- [ ] **Step 3: Write app/(dashboard)/manager/subjects/[id]/edit/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSubject } from "@/lib/actions/subjects";

export default async function EditSubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [subject, programs] = await Promise.all([
    prisma.subject.findUnique({ where: { id } }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!subject) notFound();

  const updateWithId = updateSubject.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Subject</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          defaultValue={subject.code}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={subject.name}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="credits">
          Credits
        </label>
        <input
          id="credits"
          name="credits"
          type="number"
          min="1"
          step="1"
          defaultValue={subject.credits}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="programId">
          Program
        </label>
        <select
          id="programId"
          name="programId"
          defaultValue={subject.programId}
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/manager/subjects"
git commit -m "Add Subject list/create/edit/delete pages"
```

---

### Task 7: Term filter helper + Section validation and Server Actions

**Files:**
- Create: `lib/term-filter.ts`
- Create: `lib/validation/section.ts`
- Test: `lib/validation/section.test.ts`
- Create: `lib/actions/sections.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`, `isUniqueConstraintError`/`isRestrictConstraintError` (Task 1)
- Produces: `resolveTermFilter(termIdParam?: string): Promise<string | undefined>` from `lib/term-filter.ts` (used by Tasks 8 and 12); `sectionSchema`; `createSection(formData)`, `updateSection(id, formData)`, `deleteSection(id)` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/section.test.ts
import { describe, it, expect } from "vitest";
import { sectionSchema } from "@/lib/validation/section";

const valid = { subjectId: "sub-1", termId: "term-1", teacherId: "teach-1", label: "A" };

describe("sectionSchema", () => {
  it("accepts a valid section", () => {
    expect(sectionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing subjectId", () => {
    expect(sectionSchema.safeParse({ ...valid, subjectId: "" }).success).toBe(false);
  });

  it("rejects a missing termId", () => {
    expect(sectionSchema.safeParse({ ...valid, termId: "" }).success).toBe(false);
  });

  it("rejects a missing teacherId", () => {
    expect(sectionSchema.safeParse({ ...valid, teacherId: "" }).success).toBe(false);
  });

  it("rejects an empty label", () => {
    expect(sectionSchema.safeParse({ ...valid, label: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/section.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/section'"

- [ ] **Step 3: Write lib/validation/section.ts**

```ts
import { z } from "zod";

export const sectionSchema = z.object({
  subjectId: z.string().min(1, "Subject is required"),
  termId: z.string().min(1, "Term is required"),
  teacherId: z.string().min(1, "Teacher is required"),
  label: z.string().min(1, "Label is required"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/section.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write lib/term-filter.ts**

```ts
import { prisma } from "@/lib/prisma";

// Sections and Exams default to the active term so a Manager is not staring at
// every term at once. "all" opts out; an explicit id wins; otherwise fall back
// to the active term, and to showing everything when no term is active.
export async function resolveTermFilter(termIdParam?: string): Promise<string | undefined> {
  if (termIdParam === "all") return undefined;
  if (termIdParam) return termIdParam;

  const active = await prisma.term.findFirst({ where: { isActive: true }, select: { id: true } });
  return active?.id;
}
```

- [ ] **Step 6: Write lib/actions/sections.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { sectionSchema } from "@/lib/validation/section";
import { isUniqueConstraintError, isRestrictConstraintError } from "@/lib/prisma-errors";

const DUPLICATE_MESSAGE = "That section label already exists for this subject and term.";

function readSectionForm(formData: FormData) {
  return {
    subjectId: formData.get("subjectId"),
    termId: formData.get("termId"),
    teacherId: formData.get("teacherId"),
    label: formData.get("label"),
  };
}

export async function createSection(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = sectionSchema.safeParse(readSectionForm(formData));
  if (!parsed.success) {
    redirect(`/manager/sections/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.section.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/sections/new?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/manager/sections");
}

export async function updateSection(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = sectionSchema.safeParse(readSectionForm(formData));
  if (!parsed.success) {
    redirect(`/manager/sections/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.section.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/sections/${id}/edit?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/manager/sections");
}

export async function deleteSection(id: string) {
  await requireRole(["MANAGER"]);

  try {
    await prisma.section.delete({ where: { id } });
  } catch (error) {
    if (isRestrictConstraintError(error)) {
      redirect(
        `/manager/sections?error=${encodeURIComponent(
          "Cannot delete — remove this section's routine slots and enrollments first."
        )}`
      );
    }
    throw error;
  }

  redirect("/manager/sections");
}
```

- [ ] **Step 7: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/term-filter.ts lib/validation/section.ts lib/validation/section.test.ts lib/actions/sections.ts
git commit -m "Add Section validation schema, Server Actions, and term filter helper"
```

---

### Task 8: Section list, create, and edit pages

**Files:**
- Create: `app/(dashboard)/manager/sections/page.tsx`
- Create: `app/(dashboard)/manager/sections/new/page.tsx`
- Create: `app/(dashboard)/manager/sections/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createSection`, `updateSection`, `deleteSection` (Task 7), `resolveTermFilter` (Task 7), `prisma`
- Produces: working `/manager/sections` CRUD UI with a term switcher. The detail page at `/manager/sections/[id]` is Task 10.

- [ ] **Step 1: Write app/(dashboard)/manager/sections/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteSection } from "@/lib/actions/sections";
import { resolveTermFilter } from "@/lib/term-filter";

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; termId?: string }>;
}) {
  const { error, termId } = await searchParams;
  const activeTermId = await resolveTermFilter(termId);

  const [sections, terms] = await Promise.all([
    prisma.section.findMany({
      where: activeTermId ? { termId: activeTermId } : undefined,
      include: { subject: true, term: true, teacher: { include: { user: true } } },
      orderBy: [{ subject: { code: "asc" } }, { label: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Sections</h1>
        <Link
          href="/manager/sections/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Section
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/manager/sections?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/manager/sections?termId=all"
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
            <th className="px-4 py-2 font-medium">Subject</th>
            <th className="px-4 py-2 font-medium">Label</th>
            <th className="px-4 py-2 font-medium">Term</th>
            <th className="px-4 py-2 font-medium">Teacher</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">
                {s.subject.code} — {s.subject.name}
              </td>
              <td className="px-4 py-2 text-slate-600">{s.label}</td>
              <td className="px-4 py-2 text-slate-600">{s.term.name}</td>
              <td className="px-4 py-2 text-slate-600">{s.teacher.user.name}</td>
              <td className="px-4 py-2">
                <Link href={`/manager/sections/${s.id}`} className="text-slate-600 underline">
                  Schedule
                </Link>
                <Link
                  href={`/manager/sections/${s.id}/edit`}
                  className="ml-3 text-slate-600 underline"
                >
                  Edit
                </Link>
                <form action={deleteSection.bind(null, s.id)} className="inline">
                  <button type="submit" className="ml-3 text-red-600 underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write app/(dashboard)/manager/sections/new/page.tsx**

```tsx
import { prisma } from "@/lib/prisma";
import { createSection } from "@/lib/actions/sections";

export default async function NewSectionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [subjects, terms, teachers] = await Promise.all([
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
    prisma.teacherProfile.findMany({ include: { user: true }, orderBy: { employeeId: "asc" } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Section</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createSection} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="subjectId">
          Subject
        </label>
        <select
          id="subjectId"
          name="subjectId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
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

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="teacherId">
          Teacher
        </label>
        <select
          id="teacherId"
          name="teacherId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a teacher</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.user.name} ({t.employeeId})
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="label">
          Label
        </label>
        <input
          id="label"
          name="label"
          placeholder="A"
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

- [ ] **Step 3: Write app/(dashboard)/manager/sections/[id]/edit/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSection } from "@/lib/actions/sections";

export default async function EditSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [section, subjects, terms, teachers] = await Promise.all([
    prisma.section.findUnique({ where: { id } }),
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
    prisma.teacherProfile.findMany({ include: { user: true }, orderBy: { employeeId: "asc" } }),
  ]);
  if (!section) notFound();

  const updateWithId = updateSection.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Section</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="subjectId">
          Subject
        </label>
        <select
          id="subjectId"
          name="subjectId"
          defaultValue={section.subjectId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="termId">
          Term
        </label>
        <select
          id="termId"
          name="termId"
          defaultValue={section.termId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="teacherId">
          Teacher
        </label>
        <select
          id="teacherId"
          name="teacherId"
          defaultValue={section.teacherId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.user.name} ({t.employeeId})
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="label">
          Label
        </label>
        <input
          id="label"
          name="label"
          defaultValue={section.label}
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/manager/sections"
git commit -m "Add Section list/create/edit/delete pages with term filter"
```

---

### Task 9: Routine validation and Server Actions

**Files:**
- Create: `lib/validation/routine.ts`
- Test: `lib/validation/routine.test.ts`
- Create: `lib/actions/routines.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`, `timeString` (Task 3), `parseTimeInput` (Task 2)
- Produces: `routineSchema`; `createRoutine(formData)`, `updateRoutine(id, formData)`, `deleteRoutine(id, sectionId)` — consumed by Task 10.

Routines are managed inside their Section's detail page, so every action redirects back to `/manager/sections/<sectionId>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/routine.test.ts
import { describe, it, expect } from "vitest";
import { routineSchema } from "@/lib/validation/routine";

const valid = {
  sectionId: "sec-1",
  dayOfWeek: "MONDAY",
  startTime: "09:00",
  endTime: "10:20",
  room: "Room 301",
};

describe("routineSchema", () => {
  it("accepts a valid routine slot", () => {
    expect(routineSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing sectionId", () => {
    expect(routineSchema.safeParse({ ...valid, sectionId: "" }).success).toBe(false);
  });

  it("rejects a day outside the DayOfWeek enum", () => {
    expect(routineSchema.safeParse({ ...valid, dayOfWeek: "FUNDAY" }).success).toBe(false);
  });

  it("rejects an end time before the start time", () => {
    expect(routineSchema.safeParse({ ...valid, endTime: "08:00" }).success).toBe(false);
  });

  it("rejects an end time equal to the start time", () => {
    expect(routineSchema.safeParse({ ...valid, endTime: valid.startTime }).success).toBe(false);
  });

  it("rejects a malformed time", () => {
    expect(routineSchema.safeParse({ ...valid, startTime: "9:00" }).success).toBe(false);
  });

  it("rejects an empty room", () => {
    expect(routineSchema.safeParse({ ...valid, room: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/routine.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/routine'"

- [ ] **Step 3: Write lib/validation/routine.ts**

```ts
import { z } from "zod";
import { DayOfWeek } from "@prisma/client";
import { timeString } from "@/lib/validation/fields";

export const routineSchema = z
  .object({
    sectionId: z.string().min(1, "Section is required"),
    dayOfWeek: z.nativeEnum(DayOfWeek, { message: "Day of week is required" }),
    startTime: timeString("Start time"),
    endTime: timeString("End time"),
    room: z.string().min(1, "Room is required"),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/routine.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write lib/actions/routines.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { routineSchema } from "@/lib/validation/routine";
import { parseTimeInput } from "@/lib/time";

function readRoutineForm(formData: FormData) {
  return {
    sectionId: formData.get("sectionId"),
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    room: formData.get("room"),
  };
}

export async function createRoutine(formData: FormData) {
  await requireRole(["MANAGER"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  const parsed = routineSchema.safeParse(readRoutineForm(formData));
  if (!parsed.success) {
    redirect(
      `/manager/sections/${sectionId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const data = parsed.data;
  await prisma.routine.create({
    data: {
      sectionId: data.sectionId,
      dayOfWeek: data.dayOfWeek,
      startTime: parseTimeInput(data.startTime),
      endTime: parseTimeInput(data.endTime),
      room: data.room,
    },
  });

  redirect(`/manager/sections/${data.sectionId}`);
}

export async function updateRoutine(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  const parsed = routineSchema.safeParse(readRoutineForm(formData));
  if (!parsed.success) {
    redirect(
      `/manager/sections/${sectionId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const data = parsed.data;
  await prisma.routine.update({
    where: { id },
    data: {
      dayOfWeek: data.dayOfWeek,
      startTime: parseTimeInput(data.startTime),
      endTime: parseTimeInput(data.endTime),
      room: data.room,
    },
  });

  redirect(`/manager/sections/${data.sectionId}`);
}

export async function deleteRoutine(id: string, sectionId: string) {
  await requireRole(["MANAGER"]);
  await prisma.routine.delete({ where: { id } });
  redirect(`/manager/sections/${sectionId}`);
}
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/routine.ts lib/validation/routine.test.ts lib/actions/routines.ts
git commit -m "Add Routine validation schema and Server Actions"
```

---

### Task 10: Section detail page with inline routine management

**Files:**
- Create: `app/(dashboard)/manager/sections/[id]/page.tsx`

**Interfaces:**
- Consumes: `createRoutine`, `updateRoutine`, `deleteRoutine` (Task 9), `formatTimeInput` (Task 2), `prisma`
- Produces: `/manager/sections/[id]` — the section's weekly schedule, with add/edit/delete for each slot.

Existing slots each render their own inline edit form; a final form adds a new one. All of them post to Server Actions, so no client JS is involved.

- [ ] **Step 1: Write app/(dashboard)/manager/sections/[id]/page.tsx**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createRoutine, updateRoutine, deleteRoutine } from "@/lib/actions/routines";
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

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm";

export default async function SectionDetailPage({
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
      teacher: { include: { user: true } },
      routines: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
    },
  });
  if (!section) notFound();

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/manager/sections" className="text-sm text-slate-500 underline">
          ← Back to sections
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {section.subject.code} — Section {section.label}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {section.subject.name} · {section.term.name} · {section.teacher.user.name}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <h2 className="mb-3 text-lg font-medium text-slate-900">Weekly Schedule</h2>

      {section.routines.length === 0 && (
        <p className="mb-4 text-sm text-slate-500">No slots scheduled yet.</p>
      )}

      <div className="mb-6 space-y-3">
        {section.routines.map((r) => (
          <form
            key={r.id}
            action={updateRoutine.bind(null, r.id)}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
          >
            <input type="hidden" name="sectionId" value={section.id} />
            <select name="dayOfWeek" defaultValue={r.dayOfWeek} className={inputClass}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <input
              name="startTime"
              type="time"
              defaultValue={formatTimeInput(r.startTime)}
              required
              className={inputClass}
            />
            <input
              name="endTime"
              type="time"
              defaultValue={formatTimeInput(r.endTime)}
              required
              className={inputClass}
            />
            <input
              name="room"
              defaultValue={r.room}
              required
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Save
            </button>
          </form>
        ))}
      </div>

      {section.routines.map((r) => (
        <form key={`delete-${r.id}`} action={deleteRoutine.bind(null, r.id, section.id)} className="inline">
          <button type="submit" className="mb-2 mr-3 text-sm text-red-600 underline">
            Delete {r.dayOfWeek.charAt(0) + r.dayOfWeek.slice(1).toLowerCase()}{" "}
            {formatTimeInput(r.startTime)}
          </button>
        </form>
      ))}

      <h2 className="mb-3 mt-6 text-lg font-medium text-slate-900">Add a Slot</h2>
      <form
        action={createRoutine}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <input type="hidden" name="sectionId" value={section.id} />
        <select name="dayOfWeek" defaultValue={DayOfWeek.SUNDAY} className={inputClass}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <input name="startTime" type="time" required className={inputClass} />
        <input name="endTime" type="time" required className={inputClass} />
        <input name="room" placeholder="Room" required className={`${inputClass} flex-1`} />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add
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
git add "app/(dashboard)/manager/sections/[id]/page.tsx"
git commit -m "Add Section detail page with inline routine management"
```

---

### Task 11: Exam validation and Server Actions

**Files:**
- Create: `lib/validation/exam.ts`
- Test: `lib/validation/exam.test.ts`
- Create: `lib/actions/exams.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`, `dateString`/`timeString`/`positiveInt` (Task 3), `parseDateInput`/`parseTimeInput` (Task 2), `isUniqueConstraintError` (Task 1)
- Produces: `examSchema`; `createExam(formData)`, `updateExam(id, formData)`, `deleteExam(id)` — consumed by Task 12.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/exam.test.ts
import { describe, it, expect } from "vitest";
import { examSchema } from "@/lib/validation/exam";

const valid = {
  subjectId: "sub-1",
  termId: "term-1",
  examType: "MIDTERM",
  sequence: "1",
  date: "2026-10-12",
  startTime: "10:00",
  endTime: "12:00",
  room: "Hall A",
};

describe("examSchema", () => {
  it("accepts a valid exam", () => {
    expect(examSchema.safeParse(valid).success).toBe(true);
  });

  it("coerces sequence from the form string to a number", () => {
    const result = examSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sequence).toBe(1);
  });

  it("rejects an examType outside the enum", () => {
    expect(examSchema.safeParse({ ...valid, examType: "POPQUIZ" }).success).toBe(false);
  });

  it("rejects an end time before the start time", () => {
    expect(examSchema.safeParse({ ...valid, endTime: "09:00" }).success).toBe(false);
  });

  it("rejects a sequence below 1", () => {
    expect(examSchema.safeParse({ ...valid, sequence: "0" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(examSchema.safeParse({ ...valid, date: "2026-10-2" }).success).toBe(false);
  });

  it("rejects an empty room", () => {
    expect(examSchema.safeParse({ ...valid, room: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/exam.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/exam'"

- [ ] **Step 3: Write lib/validation/exam.ts**

```ts
import { z } from "zod";
import { ExamType } from "@prisma/client";
import { dateString, timeString, positiveInt } from "@/lib/validation/fields";

export const examSchema = z
  .object({
    subjectId: z.string().min(1, "Subject is required"),
    termId: z.string().min(1, "Term is required"),
    examType: z.nativeEnum(ExamType, { message: "Exam type is required" }),
    sequence: positiveInt("Sequence"),
    date: dateString("Date"),
    startTime: timeString("Start time"),
    endTime: timeString("End time"),
    room: z.string().min(1, "Room is required"),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/exam.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write lib/actions/exams.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import type { ExamType } from "@prisma/client";
import { examSchema } from "@/lib/validation/exam";
import { parseDateInput, parseTimeInput } from "@/lib/time";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

const DUPLICATE_MESSAGE = "That exam already exists for this subject and term.";

function readExamForm(formData: FormData) {
  return {
    subjectId: formData.get("subjectId"),
    termId: formData.get("termId"),
    examType: formData.get("examType"),
    sequence: formData.get("sequence"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    room: formData.get("room"),
  };
}

function toExamData(data: {
  subjectId: string;
  termId: string;
  examType: ExamType;
  sequence: number;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
}) {
  return {
    subjectId: data.subjectId,
    termId: data.termId,
    examType: data.examType,
    sequence: data.sequence,
    date: parseDateInput(data.date),
    startTime: parseTimeInput(data.startTime),
    endTime: parseTimeInput(data.endTime),
    room: data.room,
  };
}

export async function createExam(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = examSchema.safeParse(readExamForm(formData));
  if (!parsed.success) {
    redirect(`/manager/exams/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.exam.create({ data: toExamData(parsed.data) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/exams/new?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/manager/exams");
}

export async function updateExam(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = examSchema.safeParse(readExamForm(formData));
  if (!parsed.success) {
    redirect(`/manager/exams/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.exam.update({ where: { id }, data: toExamData(parsed.data) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/exams/${id}/edit?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/manager/exams");
}

export async function deleteExam(id: string) {
  await requireRole(["MANAGER"]);
  await prisma.exam.delete({ where: { id } });
  redirect("/manager/exams");
}
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/exam.ts lib/validation/exam.test.ts lib/actions/exams.ts
git commit -m "Add Exam validation schema and Server Actions"
```

---

### Task 12: Exam pages

**Files:**
- Create: `app/(dashboard)/manager/exams/page.tsx`
- Create: `app/(dashboard)/manager/exams/new/page.tsx`
- Create: `app/(dashboard)/manager/exams/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createExam`, `updateExam`, `deleteExam` (Task 11), `resolveTermFilter` (Task 7), `formatDateInput`/`formatTimeInput` (Task 2), `prisma`
- Produces: working `/manager/exams` CRUD UI with the same term switcher as Sections.

- [ ] **Step 1: Write app/(dashboard)/manager/exams/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteExam } from "@/lib/actions/exams";
import { resolveTermFilter } from "@/lib/term-filter";
import { formatDateInput, formatTimeInput } from "@/lib/time";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; termId?: string }>;
}) {
  const { error, termId } = await searchParams;
  const activeTermId = await resolveTermFilter(termId);

  const [exams, terms] = await Promise.all([
    prisma.exam.findMany({
      where: activeTermId ? { termId: activeTermId } : undefined,
      include: { subject: true, term: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Exams</h1>
        <Link
          href="/manager/exams/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Exam
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/manager/exams?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/manager/exams?termId=all"
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
            <th className="px-4 py-2 font-medium">Subject</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">Room</th>
            <th className="px-4 py-2 font-medium">Term</th>
            <th className="px-4 py-2 font-medium">Actions</th>
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
              <td className="px-4 py-2 text-slate-600">{e.term.name}</td>
              <td className="px-4 py-2">
                <Link href={`/manager/exams/${e.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteExam.bind(null, e.id)} className="inline">
                  <button type="submit" className="ml-3 text-red-600 underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write app/(dashboard)/manager/exams/new/page.tsx**

```tsx
import { ExamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createExam } from "@/lib/actions/exams";

const EXAM_TYPES: ExamType[] = [ExamType.MIDTERM, ExamType.FINAL, ExamType.QUIZ, ExamType.OTHER];

export default async function NewExamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [subjects, terms] = await Promise.all([
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Exam</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createExam} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="subjectId">
          Subject
        </label>
        <select
          id="subjectId"
          name="subjectId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
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

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="examType">
          Exam Type
        </label>
        <select
          id="examType"
          name="examType"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {EXAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sequence">
          Sequence
        </label>
        <input
          id="sequence"
          name="sequence"
          type="number"
          min="1"
          step="1"
          defaultValue="1"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="date">
          Date
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="startTime">
          Start Time
        </label>
        <input
          id="startTime"
          name="startTime"
          type="time"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="endTime">
          End Time
        </label>
        <input
          id="endTime"
          name="endTime"
          type="time"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="room">
          Room
        </label>
        <input
          id="room"
          name="room"
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

- [ ] **Step 3: Write app/(dashboard)/manager/exams/[id]/edit/page.tsx**

Same field set as Step 2 with `defaultValue` on every input and the bound action.

```tsx
import { notFound } from "next/navigation";
import { ExamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateExam } from "@/lib/actions/exams";
import { formatDateInput, formatTimeInput } from "@/lib/time";

const EXAM_TYPES: ExamType[] = [ExamType.MIDTERM, ExamType.FINAL, ExamType.QUIZ, ExamType.OTHER];

export default async function EditExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [exam, subjects, terms] = await Promise.all([
    prisma.exam.findUnique({ where: { id } }),
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);
  if (!exam) notFound();

  const updateWithId = updateExam.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Exam</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="subjectId">
          Subject
        </label>
        <select
          id="subjectId"
          name="subjectId"
          defaultValue={exam.subjectId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="termId">
          Term
        </label>
        <select
          id="termId"
          name="termId"
          defaultValue={exam.termId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="examType">
          Exam Type
        </label>
        <select
          id="examType"
          name="examType"
          defaultValue={exam.examType}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {EXAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sequence">
          Sequence
        </label>
        <input
          id="sequence"
          name="sequence"
          type="number"
          min="1"
          step="1"
          defaultValue={exam.sequence}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="date">
          Date
        </label>
        <input
          id="date"
          name="date"
          type="date"
          defaultValue={formatDateInput(exam.date)}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="startTime">
          Start Time
        </label>
        <input
          id="startTime"
          name="startTime"
          type="time"
          defaultValue={formatTimeInput(exam.startTime)}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="endTime">
          End Time
        </label>
        <input
          id="endTime"
          name="endTime"
          type="time"
          defaultValue={formatTimeInput(exam.endTime)}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="room">
          Room
        </label>
        <input
          id="room"
          name="room"
          defaultValue={exam.room}
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/manager/exams"
git commit -m "Add Exam list/create/edit/delete pages with term filter"
```

---

### Task 13: Manager nav and overview page

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/manager/page.tsx` (replace entire file — currently a Phase 1 placeholder)

**Interfaces:**
- Consumes: `prisma`
- Produces: a Manager nav bar in the shared shell and a real overview page.

- [ ] **Step 1: Add MANAGER_NAV to app/(dashboard)/layout.tsx**

Below the existing `ADMIN_NAV` constant, add:

```tsx
const MANAGER_NAV = [
  { href: "/manager", label: "Overview" },
  { href: "/manager/terms", label: "Terms" },
  { href: "/manager/subjects", label: "Subjects" },
  { href: "/manager/sections", label: "Sections" },
  { href: "/manager/exams", label: "Exams" },
];
```

Then replace the single-role nav line:

```tsx
const nav = session.user.role === "ADMIN" ? ADMIN_NAV : [];
```

with a lookup that leaves Teacher and Student empty until their phases:

```tsx
const NAV_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  ADMIN: ADMIN_NAV,
  MANAGER: MANAGER_NAV,
};

const nav = NAV_BY_ROLE[session.user.role] ?? [];
```

Place the `NAV_BY_ROLE` constant at module scope alongside the other nav constants, not inside the component.

- [ ] **Step 2: Replace app/(dashboard)/manager/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ManagerDashboardPage() {
  const [termCount, subjectCount, sectionCount, examCount, activeTerm] = await Promise.all([
    prisma.term.count(),
    prisma.subject.count(),
    prisma.section.count(),
    prisma.exam.count(),
    prisma.term.findFirst({ where: { isActive: true } }),
  ]);

  const cards = [
    { label: "Terms", count: termCount, href: "/manager/terms" },
    { label: "Subjects", count: subjectCount, href: "/manager/subjects" },
    { label: "Sections", count: sectionCount, href: "/manager/sections" },
    { label: "Exams", count: examCount, href: "/manager/exams" },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Manager Dashboard</h1>
      <p className="mb-6 text-sm text-slate-600">
        {activeTerm ? (
          <>
            Active term: <span className="font-medium text-slate-900">{activeTerm.name}</span>
          </>
        ) : (
          "No active term — set one from the Terms page."
        )}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-300"
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{c.count}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the project type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx" "app/(dashboard)/manager/page.tsx"
git commit -m "Add Manager nav bar and overview page"
```

---

### Task 14: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1–13.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all suites pass. Phase 2 ended at 32 tests; this phase adds 11 (time) + 7 (term) + 6 (subject) + 5 (section) + 7 (routine) + 7 (exam) = 43, for **75 total across 13 files**.

- [ ] **Step 2: Start the dev server and log in as Manager**

Run: `npm run dev`, log in at `/login` with `manager@school.edu` / `Passw0rd!`.
Expected: redirected to `/manager`; the overview shows "Active term: Summer 2026" and cards reading 2 terms / 7 subjects / 9 sections / (seeded exam count); the nav bar shows Overview / Terms / Subjects / Sections / Exams.

- [ ] **Step 3: Terms CRUD and the Set Active invariant**

Create a term ("Fall 2026", 2026-09-01 → 2026-12-20, registration 2026-08-01 → 2026-08-25). Expected: appears in the list, status blank with a "Set Active" link.

Try to create one with an end date before its start date. Expected: redirected back with "End date must be after the start date".

Click "Set Active" on Fall 2026. Expected: Fall 2026 shows Active and Summer 2026 no longer does — **exactly one active term**. Verify directly in the database that exactly one row has `isActive = true`.

Set Summer 2026 back to active. Delete the Fall 2026 test term (it has no sections/exams/fees).

Attempt to delete the seeded Summer 2026 term, which has sections. Expected: banner reads "Cannot delete — one or more sections, exams, or fee items still reference this term." and the term survives.

- [ ] **Step 4: Subjects CRUD**

Create a subject ("Test Subject" / "TEST101" / 3 credits / BSc in CSE). Edit its name. Attempt to create a second subject with code `CSE101` (already seeded). Expected: "Subject code already in use."

Attempt to delete the seeded `CSE101`, which has sections. Expected: "Cannot delete — one or more sections or exams still reference this subject." Delete the unreferenced TEST101.

- [ ] **Step 5: Sections CRUD and the term filter**

Confirm `/manager/sections` defaults to the active term and shows only its sections. Click another term, confirm the list changes; click "All terms", confirm every section appears.

Create a section (CSE101 / Summer 2026 / any teacher / label "C"). Attempt to create a duplicate with label "A" for CSE101 in Summer 2026. Expected: "That section label already exists for this subject and term."

Attempt to delete a seeded section that has enrollments. Expected: "Cannot delete — remove this section's routine slots and enrollments first." Delete the test section "C" (no routines or enrollments).

- [ ] **Step 6: Routine management on the section detail page**

Open a seeded section's "Schedule" link. Expected: existing slots render with the correct days and times — **verify the times match the seed exactly** (e.g. 09:00–10:20, not 03:00–04:20), which is the check that `lib/time.ts` handles UTC correctly.

Add a slot (Wednesday 14:00–15:30, "Room 401"). Expected: appears in the list. Edit its room and save. Try an end time before the start time. Expected: "End time must be after the start time." Delete the slot.

- [ ] **Step 7: Exams CRUD**

Confirm the term filter behaves as on Sections. Create an exam (CSE101 / Summer 2026 / MIDTERM / sequence 1 / a date / 10:00–12:00 / "Hall A"). Attempt an identical duplicate. Expected: "That exam already exists for this subject and term." Create sequence 2 of the same type. Expected: accepted — the sequence field exists precisely so a type can repeat.

Edit the exam's room, confirm the date and times survive the round trip unchanged. Delete both test exams.

- [ ] **Step 8: Cross-role regression check**

Log in as `admin@school.edu`. Expected: `/manager` and `/manager/terms` both redirect to `/admin`, and the nav shows only the Admin links.

Log in as `teacher.nusrat@school.edu` (or any seeded teacher) and as a seeded student. Expected: both redirect away from `/manager`, and neither sees a nav bar (their phases have not been built).

- [ ] **Step 9: Confirm the database is back to seed state**

Verify no test rows survive: terms back to 2, subjects to 7, sections to 9, and the seeded exam count unchanged.

- [ ] **Step 10: Final commit**

If Steps 1–9 required fixes, stage and commit them with a message describing what was fixed. If not, this step is a no-op.

---

## Self-Review Notes

- **Spec coverage:** Terms (Task 3/4, including Set Active), Subjects (5/6), Sections (7/8), Routines (9/10), Exams (11/12), Manager nav and overview (13). `lib/time.ts` (Task 2) and `lib/prisma-errors.ts` (Task 1) are the spec's two "New Shared Building Blocks"; `lib/validation/fields.ts` and `lib/term-filter.ts` were added during planning to avoid duplicating the date/time regexes across four schemas and the term-filter logic across two pages.
- **Deliberately absent:** scheduling conflict detection and any enrollment/fee screens — both are spec Non-Goals. `isActive` never appears as a form field, per the Global Constraints.
- **Type consistency checked:** `requireRole(["MANAGER"])` matches the Phase 2 signature `requireRole(allowedRoles: Role[])`. `resolveTermFilter(termIdParam?: string)` is called identically in Tasks 8 and 12. Bound-action signatures (`updateTerm(id, formData)`, `deleteRoutine(id, sectionId)`, `setActiveTerm(id)`) match their `.bind()` call sites. `formatTimeInput`/`formatDateInput` take `Date` and return `string` at every call site; `parseTimeInput`/`parseDateInput` take `string` and return `Date` at every call site.
- **Enum handling:** `routineSchema` and `examSchema` use `z.nativeEnum` against the Prisma-generated `DayOfWeek`/`ExamType`, so the parsed value drops straight into Prisma without a cast.
- **Time correctness is the risk in this phase.** Task 6 Step 6 of the verification deliberately checks displayed times against the seed, because a local-time regression would render 09:00 as 03:00 (or similar) while every unit test still passed in a UTC CI environment.
