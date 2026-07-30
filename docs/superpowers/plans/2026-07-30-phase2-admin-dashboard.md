# Phase 2: Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Admin full CRUD over User accounts (all roles), Departments, Programs, and Grade Scale — the "system settings" Phase 1 scoped as Admin-exclusive — replacing the bare `/admin` placeholder with working management screens.

**Architecture:** Server Components read directly from Prisma; every mutation is a Server Action guarded by a new `requireRole()` check. Forms are plain HTML `<form action={serverAction}>` (progressive enhancement, no client JS) except the User create/edit form, which needs a small Client Component for role-conditional fields (Teacher vs Student extra fields) — that component still submits through a Server Action prop, not a client-side fetch. Errors surface as a banner via a `?error=` query param and `redirect()`, mirroring Phase 1's login page — no new client-side form-state library.

**Tech Stack:** Same as Phase 1 — Next.js 15 App Router + TypeScript, Prisma 6, zod, bcryptjs (via existing `lib/password.ts`), Vitest.

## Global Constraints

- No REST/tRPC API layer — Server Components + Server Actions only. (Phase 1 spec, still in force)
- No cascading deletes — all relations remain `Restrict`. (Phase 1 spec)
- `User` removal is `isActive = false`, never a hard delete. (Phase 1 spec)
- Role is immutable after account creation — no role selector on the edit form. (Phase 2 spec, Non-Goals)
- No email/notification flow — Admin sets passwords directly, no "forgot password." (Phase 2 spec, Non-Goals)
- No schema changes this phase — every field needed already exists from Phase 1's `prisma/schema.prisma`.
- Every Server Action starts with `await requireRole([...])` before touching Prisma.
- Errors are surfaced via `redirect("<page>?error=<message>")` banners, not per-field inline state — matches Phase 1's login page pattern exactly.

## Prerequisites (before Task 1)

1. Phase 1 must be merged into `main` and `main` must build/test clean (already done — commit `6de4955`).
2. Create an isolated worktree for this phase: `git worktree add .worktrees/phase2-admin-dashboard -b phase2-admin-dashboard main`, then `cd` into it, `npm install`, `npx prisma generate`, copy `.env` from the main worktree (or main `.env` if not gitignored per-worktree — check: `.env` is gitignored, so copy it manually: `cp ../../.env .env` from inside the new worktree, adjusting the relative path to the main repo's `.env`).
3. Verify the copied scaffold still builds: `npx tsc --noEmit && npm test` (expect 3 files / 10 tests passing, same as `main`).

---

### Task 1: `requireRole()` guard

**Files:**
- Modify: `lib/permissions.ts`
- Test: `lib/permissions.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth` (Phase 1 Task 6), `Role` from `@prisma/client`
- Produces: `requireRole(allowedRoles: Role[]): Promise<Session>` — throws `Error("Unauthorized")` if no session or role not in `allowedRoles`. Consumed by every Server Action in Tasks 2–10.

- [ ] **Step 1: Write the failing test**

Append to `lib/permissions.test.ts` (keep the existing `dashboardPathForRole`/`isPathAllowedForRole` describe blocks above this):

```ts
import { requireRole } from "@/lib/permissions";
import { vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("requireRole", () => {
  it("returns the session when the role is allowed", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "ADMIN" },
      expires: "",
    } as never);

    const session = await requireRole(["ADMIN"]);
    expect(session.user.role).toBe("ADMIN");
  });

  it("throws when the session has no user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(requireRole(["ADMIN"])).rejects.toThrow("Unauthorized");
  });

  it("throws when the role is not in the allowed list", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "STUDENT" },
      expires: "",
    } as never);
    await expect(requireRole(["ADMIN", "MANAGER"])).rejects.toThrow("Unauthorized");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/permissions.test.ts`
Expected: FAIL with "requireRole is not exported" or similar.

- [ ] **Step 3: Add requireRole to lib/permissions.ts**

Add to the top of `lib/permissions.ts` (keep the existing `dashboardPathForRole`/`isPathAllowedForRole` functions below):

```ts
import { auth } from "@/auth";
import type { Session } from "next-auth";
```

Add at the bottom of the file:

```ts
export async function requireRole(allowedRoles: Role[]): Promise<Session> {
  const session = await auth();
  if (!session?.user?.role || !allowedRoles.includes(session.user.role)) {
    throw new Error("Unauthorized");
  }
  return session;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/permissions.test.ts`
Expected: PASS (7 tests: 4 existing + 3 new)

- [ ] **Step 5: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/permissions.ts lib/permissions.test.ts
git commit -m "Add requireRole() Server Action guard"
```

---

### Task 2: Department validation + Server Actions

**Files:**
- Create: `lib/validation/department.ts`
- Test: `lib/validation/department.test.ts`
- Create: `lib/actions/departments.ts`

**Interfaces:**
- Consumes: `requireRole` (Task 1), `prisma` (Phase 1 Task 3)
- Produces: `departmentSchema` (zod), `createDepartment(formData: FormData)`, `updateDepartment(id: string, formData: FormData)`, `deleteDepartment(id: string)` — all Server Actions, consumed by Task 3's pages.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/department.test.ts
import { describe, it, expect } from "vitest";
import { departmentSchema } from "@/lib/validation/department";

describe("departmentSchema", () => {
  it("accepts a valid department", () => {
    const result = departmentSchema.safeParse({ name: "Computer Science", code: "CS" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = departmentSchema.safeParse({ name: "", code: "CS" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty code", () => {
    const result = departmentSchema.safeParse({ name: "Computer Science", code: "" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/department.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/department'"

- [ ] **Step 3: Write lib/validation/department.ts**

```ts
import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/department.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write lib/actions/departments.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { departmentSchema } from "@/lib/validation/department";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRestrictConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2003" || error.code === "P2014")
  );
}

export async function createDepartment(formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = departmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    redirect(`/admin/departments/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.department.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/admin/departments/new?error=${encodeURIComponent("Department code already in use.")}`);
    }
    throw error;
  }

  redirect("/admin/departments");
}

export async function updateDepartment(id: string, formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = departmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    redirect(`/admin/departments/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.department.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/admin/departments/${id}/edit?error=${encodeURIComponent("Department code already in use.")}`);
    }
    throw error;
  }

  redirect("/admin/departments");
}

export async function deleteDepartment(id: string) {
  await requireRole(["ADMIN"]);

  try {
    await prisma.department.delete({ where: { id } });
  } catch (error) {
    if (isRestrictConstraintError(error)) {
      redirect(
        `/admin/departments?error=${encodeURIComponent(
          "Cannot delete — one or more programs or teachers still reference this department."
        )}`
      );
    }
    throw error;
  }

  redirect("/admin/departments");
}
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/department.ts lib/validation/department.test.ts lib/actions/departments.ts
git commit -m "Add Department validation schema and Server Actions"
```

---

### Task 3: Department pages

**Files:**
- Create: `app/(dashboard)/admin/departments/page.tsx`
- Create: `app/(dashboard)/admin/departments/new/page.tsx`
- Create: `app/(dashboard)/admin/departments/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createDepartment`, `updateDepartment`, `deleteDepartment` (Task 2), `prisma` (Phase 1 Task 3)
- Produces: working `/admin/departments` CRUD UI. Establishes the list/new/edit page pattern Tasks 5 and 7 (Programs, Grade Scale) copy.

- [ ] **Step 1: Write app/(dashboard)/admin/departments/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteDepartment } from "@/lib/actions/departments";

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Departments</h1>
        <Link
          href="/admin/departments/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Department
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Code</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {departments.map((d) => (
            <tr key={d.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{d.name}</td>
              <td className="px-4 py-2 text-slate-600">{d.code}</td>
              <td className="px-4 py-2">
                <Link href={`/admin/departments/${d.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteDepartment.bind(null, d.id)} className="inline">
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

- [ ] **Step 2: Write app/(dashboard)/admin/departments/new/page.tsx**

```tsx
import { createDepartment } from "@/lib/actions/departments";

export default async function NewDepartmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Department</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createDepartment} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
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

- [ ] **Step 3: Write app/(dashboard)/admin/departments/[id]/edit/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateDepartment } from "@/lib/actions/departments";

export default async function EditDepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const department = await prisma.department.findUnique({ where: { id } });
  if (!department) notFound();

  const updateWithId = updateDepartment.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Department</h1>

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
          defaultValue={department.name}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          defaultValue={department.code}
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

- [ ] **Step 4: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/departments"
git commit -m "Add Department list/create/edit/delete pages"
```

---

### Task 4: Program validation + Server Actions

**Files:**
- Create: `lib/validation/program.ts`
- Test: `lib/validation/program.test.ts`
- Create: `lib/actions/programs.ts`

**Interfaces:**
- Consumes: `requireRole` (Task 1), `prisma` (Phase 1 Task 3)
- Produces: `programSchema`, `createProgram`, `updateProgram`, `deleteProgram` — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/program.test.ts
import { describe, it, expect } from "vitest";
import { programSchema } from "@/lib/validation/program";

describe("programSchema", () => {
  it("accepts a valid program", () => {
    const result = programSchema.safeParse({
      name: "BSc in Computer Science",
      code: "BSC-CSE",
      departmentId: "dept-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing departmentId", () => {
    const result = programSchema.safeParse({ name: "BSc in CS", code: "BSC-CSE", departmentId: "" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/program.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/program'"

- [ ] **Step 3: Write lib/validation/program.ts**

```ts
import { z } from "zod";

export const programSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  departmentId: z.string().min(1, "Department is required"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/program.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write lib/actions/programs.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { programSchema } from "@/lib/validation/program";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRestrictConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2003" || error.code === "P2014")
  );
}

export async function createProgram(formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = programSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) {
    redirect(`/admin/programs/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.program.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/admin/programs/new?error=${encodeURIComponent("Program code already in use.")}`);
    }
    throw error;
  }

  redirect("/admin/programs");
}

export async function updateProgram(id: string, formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = programSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) {
    redirect(`/admin/programs/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.program.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/admin/programs/${id}/edit?error=${encodeURIComponent("Program code already in use.")}`);
    }
    throw error;
  }

  redirect("/admin/programs");
}

export async function deleteProgram(id: string) {
  await requireRole(["ADMIN"]);

  try {
    await prisma.program.delete({ where: { id } });
  } catch (error) {
    if (isRestrictConstraintError(error)) {
      redirect(
        `/admin/programs?error=${encodeURIComponent(
          "Cannot delete — one or more subjects or students still reference this program."
        )}`
      );
    }
    throw error;
  }

  redirect("/admin/programs");
}
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/program.ts lib/validation/program.test.ts lib/actions/programs.ts
git commit -m "Add Program validation schema and Server Actions"
```

---

### Task 5: Program pages

**Files:**
- Create: `app/(dashboard)/admin/programs/page.tsx`
- Create: `app/(dashboard)/admin/programs/new/page.tsx`
- Create: `app/(dashboard)/admin/programs/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createProgram`, `updateProgram`, `deleteProgram` (Task 4), `prisma` (Phase 1 Task 3)
- Produces: working `/admin/programs` CRUD UI, identical structure to Task 3 plus a Department `<select>`.

- [ ] **Step 1: Write app/(dashboard)/admin/programs/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteProgram } from "@/lib/actions/programs";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const programs = await prisma.program.findMany({
    include: { department: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Programs</h1>
        <Link
          href="/admin/programs/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Program
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Code</th>
            <th className="px-4 py-2 font-medium">Department</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {programs.map((p) => (
            <tr key={p.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{p.name}</td>
              <td className="px-4 py-2 text-slate-600">{p.code}</td>
              <td className="px-4 py-2 text-slate-600">{p.department.name}</td>
              <td className="px-4 py-2">
                <Link href={`/admin/programs/${p.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteProgram.bind(null, p.id)} className="inline">
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

- [ ] **Step 2: Write app/(dashboard)/admin/programs/new/page.tsx**

```tsx
import { prisma } from "@/lib/prisma";
import { createProgram } from "@/lib/actions/programs";

export default async function NewProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Program</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createProgram} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="departmentId">
          Department
        </label>
        <select
          id="departmentId"
          name="departmentId"
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
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

- [ ] **Step 3: Write app/(dashboard)/admin/programs/[id]/edit/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateProgram } from "@/lib/actions/programs";

export default async function EditProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [program, departments] = await Promise.all([
    prisma.program.findUnique({ where: { id } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!program) notFound();

  const updateWithId = updateProgram.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Program</h1>

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
          defaultValue={program.name}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          defaultValue={program.code}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="departmentId">
          Department
        </label>
        <select
          id="departmentId"
          name="departmentId"
          defaultValue={program.departmentId}
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
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

- [ ] **Step 4: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/programs"
git commit -m "Add Program list/create/edit/delete pages"
```

---

### Task 6: Grade Scale validation + Server Actions

**Files:**
- Create: `lib/validation/grade-scale.ts`
- Test: `lib/validation/grade-scale.test.ts`
- Create: `lib/actions/grade-scale.ts`

**Interfaces:**
- Consumes: `requireRole` (Task 1), `prisma` (Phase 1 Task 3)
- Produces: `gradeScaleSchema`, `createGradeBand`, `updateGradeBand`, `deleteGradeBand` — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/grade-scale.test.ts
import { describe, it, expect } from "vitest";
import { gradeScaleSchema } from "@/lib/validation/grade-scale";

describe("gradeScaleSchema", () => {
  it("accepts a valid band", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "90",
      maxMarks: "100",
      letterGrade: "A+",
      gradePoint: "4.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects minMarks >= maxMarks", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "90",
      maxMarks: "80",
      letterGrade: "A+",
      gradePoint: "4.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing letterGrade", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "80",
      maxMarks: "90",
      letterGrade: "",
      gradePoint: "3.5",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/grade-scale.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/grade-scale'"

- [ ] **Step 3: Write lib/validation/grade-scale.ts**

Form fields arrive as strings (from `FormData`), so marks/points are coerced to numbers before the range check:

```ts
import { z } from "zod";

export const gradeScaleSchema = z
  .object({
    minMarks: z.coerce.number().min(0),
    maxMarks: z.coerce.number().min(0),
    letterGrade: z.string().min(1, "Letter grade is required"),
    gradePoint: z.coerce.number().min(0).max(4),
  })
  .refine((data) => data.minMarks < data.maxMarks, {
    message: "Minimum marks must be less than maximum marks",
    path: ["minMarks"],
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/grade-scale.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write lib/actions/grade-scale.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { gradeScaleSchema } from "@/lib/validation/grade-scale";

export async function createGradeBand(formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = gradeScaleSchema.safeParse({
    minMarks: formData.get("minMarks"),
    maxMarks: formData.get("maxMarks"),
    letterGrade: formData.get("letterGrade"),
    gradePoint: formData.get("gradePoint"),
  });
  if (!parsed.success) {
    redirect(`/admin/grade-scale/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  await prisma.gradeScale.create({ data: parsed.data });
  redirect("/admin/grade-scale");
}

export async function updateGradeBand(id: string, formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = gradeScaleSchema.safeParse({
    minMarks: formData.get("minMarks"),
    maxMarks: formData.get("maxMarks"),
    letterGrade: formData.get("letterGrade"),
    gradePoint: formData.get("gradePoint"),
  });
  if (!parsed.success) {
    redirect(`/admin/grade-scale/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  await prisma.gradeScale.update({ where: { id }, data: parsed.data });
  redirect("/admin/grade-scale");
}

export async function deleteGradeBand(id: string) {
  await requireRole(["ADMIN"]);
  await prisma.gradeScale.delete({ where: { id } });
  redirect("/admin/grade-scale");
}
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/grade-scale.ts lib/validation/grade-scale.test.ts lib/actions/grade-scale.ts
git commit -m "Add Grade Scale validation schema and Server Actions"
```

---

### Task 7: Grade Scale pages

**Files:**
- Create: `app/(dashboard)/admin/grade-scale/page.tsx`
- Create: `app/(dashboard)/admin/grade-scale/new/page.tsx`
- Create: `app/(dashboard)/admin/grade-scale/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createGradeBand`, `updateGradeBand`, `deleteGradeBand` (Task 6), `prisma` (Phase 1 Task 3)
- Produces: working `/admin/grade-scale` CRUD UI. `GradeScale.minMarks`/`maxMarks`/`gradePoint` are Prisma `Decimal` — call `.toString()` before rendering or passing as a `defaultValue`, per Phase 1's Global Constraints note on Decimal fields.

- [ ] **Step 1: Write app/(dashboard)/admin/grade-scale/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteGradeBand } from "@/lib/actions/grade-scale";

export default async function GradeScalePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const bands = await prisma.gradeScale.findMany({ orderBy: { minMarks: "desc" } });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Grade Scale</h1>
        <Link
          href="/admin/grade-scale/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Band
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Marks Range</th>
            <th className="px-4 py-2 font-medium">Letter Grade</th>
            <th className="px-4 py-2 font-medium">Grade Point</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">
                {b.minMarks.toString()} – {b.maxMarks.toString()}
              </td>
              <td className="px-4 py-2 text-slate-600">{b.letterGrade}</td>
              <td className="px-4 py-2 text-slate-600">{b.gradePoint.toString()}</td>
              <td className="px-4 py-2">
                <Link href={`/admin/grade-scale/${b.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteGradeBand.bind(null, b.id)} className="inline">
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

- [ ] **Step 2: Write app/(dashboard)/admin/grade-scale/new/page.tsx**

```tsx
import { createGradeBand } from "@/lib/actions/grade-scale";

export default async function NewGradeBandPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Grade Band</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createGradeBand} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="minMarks">
          Min Marks
        </label>
        <input
          id="minMarks"
          name="minMarks"
          type="number"
          step="0.01"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="maxMarks">
          Max Marks
        </label>
        <input
          id="maxMarks"
          name="maxMarks"
          type="number"
          step="0.01"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="letterGrade">
          Letter Grade
        </label>
        <input
          id="letterGrade"
          name="letterGrade"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="gradePoint">
          Grade Point
        </label>
        <input
          id="gradePoint"
          name="gradePoint"
          type="number"
          step="0.01"
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

- [ ] **Step 3: Write app/(dashboard)/admin/grade-scale/[id]/edit/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateGradeBand } from "@/lib/actions/grade-scale";

export default async function EditGradeBandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const band = await prisma.gradeScale.findUnique({ where: { id } });
  if (!band) notFound();

  const updateWithId = updateGradeBand.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Grade Band</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="minMarks">
          Min Marks
        </label>
        <input
          id="minMarks"
          name="minMarks"
          type="number"
          step="0.01"
          defaultValue={band.minMarks.toString()}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="maxMarks">
          Max Marks
        </label>
        <input
          id="maxMarks"
          name="maxMarks"
          type="number"
          step="0.01"
          defaultValue={band.maxMarks.toString()}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="letterGrade">
          Letter Grade
        </label>
        <input
          id="letterGrade"
          name="letterGrade"
          defaultValue={band.letterGrade}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="gradePoint">
          Grade Point
        </label>
        <input
          id="gradePoint"
          name="gradePoint"
          type="number"
          step="0.01"
          defaultValue={band.gradePoint.toString()}
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

- [ ] **Step 4: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/grade-scale"
git commit -m "Add Grade Scale list/create/edit/delete pages"
```

---

### Task 8: User validation schemas

**Files:**
- Create: `lib/validation/user.ts`
- Test: `lib/validation/user.test.ts`

**Interfaces:**
- Consumes: `Role` from `@prisma/client`
- Produces: `createUserSchema`, `editUserSchema`, `resetPasswordSchema` (zod discriminated unions on `role` for create/edit) — consumed by Task 9's Server Actions.

- [ ] **Step 1: Write the failing test**

```ts
// lib/validation/user.test.ts
import { describe, it, expect } from "vitest";
import { createUserSchema, editUserSchema, resetPasswordSchema } from "@/lib/validation/user";

describe("createUserSchema", () => {
  it("accepts a valid ADMIN user", () => {
    const result = createUserSchema.safeParse({
      role: "ADMIN",
      name: "Ayesha Rahman",
      email: "admin2@school.edu",
      password: "Passw0rd!",
    });
    expect(result.success).toBe(true);
  });

  it("requires employeeId/departmentId/designation for TEACHER", () => {
    const result = createUserSchema.safeParse({
      role: "TEACHER",
      name: "Dr. Test",
      email: "test.teacher@school.edu",
      password: "Passw0rd!",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid TEACHER user", () => {
    const result = createUserSchema.safeParse({
      role: "TEACHER",
      name: "Dr. Test",
      email: "test.teacher@school.edu",
      password: "Passw0rd!",
      employeeId: "EMP-099",
      departmentId: "dept-1",
      designation: "Lecturer",
    });
    expect(result.success).toBe(true);
  });

  it("requires studentId/programId for STUDENT", () => {
    const result = createUserSchema.safeParse({
      role: "STUDENT",
      name: "Test Student",
      email: "test.student@school.edu",
      password: "Passw0rd!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = createUserSchema.safeParse({
      role: "ADMIN",
      name: "Ayesha Rahman",
      email: "admin2@school.edu",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("editUserSchema", () => {
  it("accepts a valid STUDENT edit without a password field", () => {
    const result = editUserSchema.safeParse({
      role: "STUDENT",
      name: "Test Student",
      email: "test.student@school.edu",
      studentId: "STU-9999",
      programId: "prog-1",
    });
    expect(result.success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects a short password", () => {
    expect(resetPasswordSchema.safeParse({ password: "short" }).success).toBe(false);
  });

  it("accepts an 8+ character password", () => {
    expect(resetPasswordSchema.safeParse({ password: "NewPassw0rd!" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validation/user.test.ts`
Expected: FAIL with "Cannot find module '@/lib/validation/user'"

- [ ] **Step 3: Write lib/validation/user.ts**

```ts
import { z } from "zod";

const baseFields = {
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
};

const teacherFields = {
  employeeId: z.string().min(1, "Employee ID is required"),
  departmentId: z.string().min(1, "Department is required"),
  designation: z.string().min(1, "Designation is required"),
};

const studentFields = {
  studentId: z.string().min(1, "Student ID is required"),
  programId: z.string().min(1, "Program is required"),
};

export const createUserSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("ADMIN"), ...baseFields, password: z.string().min(8, "Password must be at least 8 characters") }),
  z.object({ role: z.literal("MANAGER"), ...baseFields, password: z.string().min(8, "Password must be at least 8 characters") }),
  z.object({
    role: z.literal("TEACHER"),
    ...baseFields,
    password: z.string().min(8, "Password must be at least 8 characters"),
    ...teacherFields,
  }),
  z.object({
    role: z.literal("STUDENT"),
    ...baseFields,
    password: z.string().min(8, "Password must be at least 8 characters"),
    ...studentFields,
  }),
]);

export const editUserSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("ADMIN"), ...baseFields }),
  z.object({ role: z.literal("MANAGER"), ...baseFields }),
  z.object({ role: z.literal("TEACHER"), ...baseFields, ...teacherFields }),
  z.object({ role: z.literal("STUDENT"), ...baseFields, ...studentFields }),
]);

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/user.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/user.ts lib/validation/user.test.ts
git commit -m "Add User validation schemas (create/edit/reset-password)"
```

---

### Task 9: User Server Actions

**Files:**
- Create: `lib/actions/users.ts`

**Interfaces:**
- Consumes: `requireRole` (Task 1), `createUserSchema`/`editUserSchema`/`resetPasswordSchema` (Task 8), `hashPassword` (Phase 1 Task 4), `prisma` (Phase 1 Task 3)
- Produces: `createUser(formData)`, `updateUser(id, formData)`, `toggleUserActive(id, currentlyActive)`, `resetUserPassword(id, formData)` — consumed by Task 10's pages.

- [ ] **Step 1: Write lib/actions/users.ts**

```ts
"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { createUserSchema, editUserSchema, resetPasswordSchema } from "@/lib/validation/user";
import { hashPassword } from "@/lib/password";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const DUPLICATE_MESSAGE = "Email, employee ID, or student ID already in use.";

export async function createUser(formData: FormData) {
  await requireRole(["ADMIN"]);

  const raw = {
    role: formData.get("role"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    employeeId: formData.get("employeeId") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    designation: formData.get("designation") || undefined,
    studentId: formData.get("studentId") || undefined,
    programId: formData.get("programId") || undefined,
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/admin/users/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const data = parsed.data;
  const passwordHash = await hashPassword(data.password);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: data.name, email: data.email, role: data.role, passwordHash },
      });

      if (data.role === "TEACHER") {
        await tx.teacherProfile.create({
          data: {
            userId: user.id,
            employeeId: data.employeeId,
            departmentId: data.departmentId,
            designation: data.designation,
          },
        });
      } else if (data.role === "STUDENT") {
        await tx.studentProfile.create({
          data: { userId: user.id, studentId: data.studentId, programId: data.programId },
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/admin/users/new?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/admin/users");
}

export async function updateUser(id: string, formData: FormData) {
  await requireRole(["ADMIN"]);

  const raw = {
    role: formData.get("role"),
    name: formData.get("name"),
    email: formData.get("email"),
    employeeId: formData.get("employeeId") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    designation: formData.get("designation") || undefined,
    studentId: formData.get("studentId") || undefined,
    programId: formData.get("programId") || undefined,
  };

  const parsed = editUserSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/admin/users/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { name: data.name, email: data.email } });

      if (data.role === "TEACHER") {
        await tx.teacherProfile.update({
          where: { userId: id },
          data: { employeeId: data.employeeId, departmentId: data.departmentId, designation: data.designation },
        });
      } else if (data.role === "STUDENT") {
        await tx.studentProfile.update({
          where: { userId: id },
          data: { studentId: data.studentId, programId: data.programId },
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/admin/users/${id}/edit?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/admin/users");
}

export async function toggleUserActive(id: string, currentlyActive: boolean) {
  await requireRole(["ADMIN"]);
  await prisma.user.update({ where: { id }, data: { isActive: !currentlyActive } });
  redirect("/admin/users");
}

export async function resetUserPassword(id: string, formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    redirect(`/admin/users/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  redirect(`/admin/users/${id}/edit?success=password-reset`);
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/users.ts
git commit -m "Add User Server Actions (create/update/toggle-active/reset-password)"
```

---

### Task 10: User pages

**Files:**
- Create: `app/(dashboard)/admin/users/_components/user-form.tsx`
- Create: `app/(dashboard)/admin/users/page.tsx`
- Create: `app/(dashboard)/admin/users/new/page.tsx`
- Create: `app/(dashboard)/admin/users/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createUser`, `updateUser`, `toggleUserActive`, `resetUserPassword` (Task 9), `prisma` (Phase 1 Task 3)
- Produces: working `/admin/users` CRUD UI with role-conditional fields. `UserForm` is a Client Component (needs `useState` to show/hide Teacher/Student fields as the role select changes) but still submits through a plain Server Action passed in as `action` — no client-side fetch/JSON.

- [ ] **Step 1: Write app/(dashboard)/admin/users/_components/user-form.tsx**

```tsx
"use client";

import { useState } from "react";
import type { Department, Program, Role } from "@prisma/client";

type UserFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => void;
  departments: Department[];
  programs: Program[];
  defaultValues?: {
    role: Role;
    name: string;
    email: string;
    employeeId?: string | null;
    departmentId?: string | null;
    designation?: string | null;
    studentId?: string | null;
    programId?: string | null;
  };
};

export function UserForm({ mode, action, departments, programs, defaultValues }: UserFormProps) {
  const [role, setRole] = useState<Role>(defaultValues?.role ?? "ADMIN");

  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-white p-6">
      {mode === "create" ? (
        <>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="role">
            Role
          </label>
          <select
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="TEACHER">Teacher</option>
            <option value="STUDENT">Student</option>
          </select>
        </>
      ) : (
        <>
          <input type="hidden" name="role" value={role} />
          <p className="mb-4 text-sm text-slate-500">
            Role: <span className="font-medium text-slate-900">{role}</span> (cannot be changed)
          </p>
        </>
      )}

      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
        Name
      </label>
      <input
        id="name"
        name="name"
        defaultValue={defaultValues?.name}
        required
        className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        defaultValue={defaultValues?.email}
        required
        className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      {mode === "create" && (
        <>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </>
      )}

      {role === "TEACHER" && (
        <>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="employeeId">
            Employee ID
          </label>
          <input
            id="employeeId"
            name="employeeId"
            defaultValue={defaultValues?.employeeId ?? ""}
            required
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="departmentId">
            Department
          </label>
          <select
            id="departmentId"
            name="departmentId"
            defaultValue={defaultValues?.departmentId ?? ""}
            required
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select a department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="designation">
            Designation
          </label>
          <input
            id="designation"
            name="designation"
            defaultValue={defaultValues?.designation ?? ""}
            required
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </>
      )}

      {role === "STUDENT" && (
        <>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="studentId">
            Student ID
          </label>
          <input
            id="studentId"
            name="studentId"
            defaultValue={defaultValues?.studentId ?? ""}
            required
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="programId">
            Program
          </label>
          <select
            id="programId"
            name="programId"
            defaultValue={defaultValues?.programId ?? ""}
            required
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select a program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      )}

      <button
        type="submit"
        className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        {mode === "create" ? "Create" : "Save"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write app/(dashboard)/admin/users/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["ADMIN", "MANAGER", "TEACHER", "STUDENT"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const roleFilter = role && ROLES.includes(role as Role) ? (role as Role) : undefined;

  const users = await prisma.user.findMany({
    where: roleFilter ? { role: roleFilter } : undefined,
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New User
        </Link>
      </div>

      <div className="mb-4 flex gap-4 text-sm">
        <Link href="/admin/users" className={!roleFilter ? "font-medium text-slate-900" : "text-slate-500"}>
          All
        </Link>
        {ROLES.map((r) => (
          <Link
            key={r}
            href={`/admin/users?role=${r}`}
            className={roleFilter === r ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {r}
          </Link>
        ))}
      </div>

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{u.name}</td>
              <td className="px-4 py-2 text-slate-600">{u.email}</td>
              <td className="px-4 py-2 text-slate-600">{u.role}</td>
              <td className="px-4 py-2">
                <span className={u.isActive ? "text-green-700" : "text-red-700"}>
                  {u.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-2">
                <Link href={`/admin/users/${u.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Write app/(dashboard)/admin/users/new/page.tsx**

```tsx
import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/actions/users";
import { UserForm } from "../_components/user-form";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [departments, programs] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New User</h1>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <UserForm mode="create" action={createUser} departments={departments} programs={programs} />
    </div>
  );
}
```

- [ ] **Step 4: Write app/(dashboard)/admin/users/[id]/edit/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateUser, resetUserPassword, toggleUserActive } from "@/lib/actions/users";
import { UserForm } from "../../_components/user-form";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const { error, success } = await searchParams;

  const [user, departments, programs] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true, studentProfile: true },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  const updateWithId = updateUser.bind(null, id);
  const resetPasswordWithId = resetUserPassword.bind(null, id);
  const toggleActiveWithId = toggleUserActive.bind(null, id, user.isActive);

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Edit User</h1>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {success === "password-reset" && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Password updated.</p>
      )}

      <UserForm
        mode="edit"
        action={updateWithId}
        departments={departments}
        programs={programs}
        defaultValues={{
          role: user.role,
          name: user.name,
          email: user.email,
          employeeId: user.teacherProfile?.employeeId,
          departmentId: user.teacherProfile?.departmentId,
          designation: user.teacherProfile?.designation,
          studentId: user.studentProfile?.studentId,
          programId: user.studentProfile?.programId,
        }}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-slate-700">Reset Password</h2>
        <form action={resetPasswordWithId}>
          <input
            name="password"
            type="password"
            minLength={8}
            placeholder="New password"
            required
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Set New Password
          </button>
        </form>
      </div>

      <form action={toggleActiveWithId}>
        <button
          type="submit"
          className={`w-full rounded-md px-4 py-2 text-sm font-medium ${
            user.isActive
              ? "border border-red-300 text-red-700 hover:bg-red-50"
              : "border border-green-300 text-green-700 hover:bg-green-50"
          }`}
        >
          {user.isActive ? "Deactivate Account" : "Reactivate Account"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/admin/users"
git commit -m "Add User list/create/edit pages with role-conditional fields"
```

---

### Task 11: Admin nav and overview page

**Files:**
- Modify: `app/(dashboard)/layout.tsx` (replace entire file — Phase 1's version has no nav)
- Modify: `app/(dashboard)/admin/page.tsx` (replace entire file — Phase 1's version is a static placeholder)

**Interfaces:**
- Consumes: `prisma` (Phase 1 Task 3)
- Produces: an Admin nav bar in the shared dashboard shell and a real Admin overview page with entity counts linking into each section.

- [ ] **Step 1: Replace app/(dashboard)/layout.tsx**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/departments", label: "Departments" },
  { href: "/admin/programs", label: "Programs" },
  { href: "/admin/grade-scale", label: "Grade Scale" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.role) {
    redirect("/login");
  }

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const nav = session.user.role === "ADMIN" ? ADMIN_NAV : [];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-sm text-slate-500">Signed in as</p>
          <p className="font-medium text-slate-900">
            {session.user.name} · {ROLE_LABEL[session.user.role]}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </header>
      {nav.length > 0 && (
        <nav className="flex gap-4 border-b border-slate-200 bg-white px-6 py-2 text-sm">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-slate-600 hover:text-slate-900">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Replace app/(dashboard)/admin/page.tsx**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const [userCount, departmentCount, programCount, gradeScaleCount] = await Promise.all([
    prisma.user.count(),
    prisma.department.count(),
    prisma.program.count(),
    prisma.gradeScale.count(),
  ]);

  const cards = [
    { label: "Users", count: userCount, href: "/admin/users" },
    { label: "Departments", count: departmentCount, href: "/admin/departments" },
    { label: "Programs", count: programCount, href: "/admin/programs" },
    { label: "Grade Scale Bands", count: gradeScaleCount, href: "/admin/grade-scale" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Admin Dashboard</h1>
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

- [ ] **Step 3: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx" "app/(dashboard)/admin/page.tsx"
git commit -m "Add Admin nav bar and overview page with entity counts"
```

---

### Task 12: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1–11.
- Produces: confidence that Admin CRUD works end-to-end against the seeded dev database before Phase 3 builds on top.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all Vitest suites pass (password, permissions incl. requireRole, auth.config, and the four new validation schema suites).

- [ ] **Step 2: Start the dev server and log in as Admin**

Run: `npm run dev`, log in at `/login` with `admin@school.edu` / `Passw0rd!`.
Expected: redirected to `/admin`, overview page shows 4 cards with non-zero counts (11 users, 2 departments, 3 programs, 10 grade bands from the Phase 1 seed) and the nav bar shows Overview/Users/Departments/Programs/Grade Scale.

- [ ] **Step 3: Create, edit, deactivate, and reset a Teacher's password**

At `/admin/users/new`: create a Teacher (role=Teacher, fill employeeId/department/designation). Expected: redirected to `/admin/users`, new row appears with role TEACHER and status Active.

Edit that user's name at `/admin/users/[id]/edit`, save. Expected: redirected to `/admin/users`, updated name shows in the list.

On the same edit page, use "Reset Password" with a new 8+ character password. Expected: redirected back to the edit page showing "Password updated."

Click "Deactivate Account". Expected: redirected to `/admin/users`, status shows Inactive.

Open a new browser session (or sign out), attempt to log in as that now-inactive teacher with the reset password. Expected: `/login?error=invalid-credentials` — confirms `authorize()`'s `isActive` check (Phase 1 Task 6) still blocks deactivated accounts.

Reactivate the account from `/admin/users/[id]/edit` and confirm login now succeeds with the reset password.

- [ ] **Step 4: Create a Student and verify role-conditional fields**

At `/admin/users/new`, select role Student. Expected: form swaps to show Student ID + Program fields (no Employee ID/Department/Designation). Create the account, verify it logs in and redirects to `/student`.

- [ ] **Step 5: Departments and Programs CRUD, including the FK-restrict error path**

Create a new Department (e.g. "Test Dept" / "TEST"), verify it appears in the list. Edit its name, verify the change. Delete it (it has no Programs/Teachers) — expect redirect to `/admin/departments` with the row gone.

Attempt to delete the seeded "Computer Science & Engineering" (CSE) department, which has Programs and TeacherProfiles referencing it. Expected: redirected to `/admin/departments?error=...`, banner reads "Cannot delete — one or more programs or teachers still reference this department." — department still present in the list.

Repeat create/edit/delete for a test Program, and confirm the same FK-restrict message when attempting to delete a seeded Program that has Subjects/StudentProfiles.

- [ ] **Step 6: Grade Scale CRUD**

Create a new band (e.g. minMarks 100, maxMarks 105 — deliberately outside the normal 0–100 range is fine, no cross-row check per spec). Edit it. Attempt to create a band with `minMarks >= maxMarks`; expected: redirected back to the form with "Minimum marks must be less than maximum marks." Delete the test band.

- [ ] **Step 7: Cross-role regression check**

Log in as `manager@school.edu`, confirm `/admin` and `/admin/users` still redirect back to `/manager` (Phase 1's middleware + `isPathAllowedForRole` still enforce this — Phase 2 added no changes to `middleware.ts`).

- [ ] **Step 8: Final commit**

If Steps 1–7 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed, this step is a no-op.

---

## Self-Review Notes

- **Spec coverage:** Users (create/edit/deactivate-reactivate/reset-password, role-conditional fields), Departments (CRUD + FK-restrict friendly error), Programs (CRUD + FK-restrict friendly error), Grade Scale (CRUD + min<max validation) — every feature in the Phase 2 spec has a task. `requireRole()` (spec's "New Shared Building Block") is Task 1, consumed by every Server Action in Tasks 2, 4, 6, 9.
- **Deliberately deferred:** cross-row Grade Scale overlap validation and bulk user import are spec Non-Goals/Out-of-Scope, not oversights.
- **Type consistency checked:** `requireRole(allowedRoles: Role[])` signature (Task 1) matches every call site (`requireRole(["ADMIN"])`) in Tasks 2, 4, 6, 9. `UserForm`'s `defaultValues` shape (Task 10) matches the fields read off `user`/`user.teacherProfile`/`user.studentProfile` in the edit page. Server Action signatures used with `.bind()` (`updateDepartment(id, formData)`, `toggleUserActive(id, currentlyActive)`, etc.) match their definitions in Tasks 2/4/6/9 and their call sites in Tasks 3/5/7/10.
- **Decimal handling:** Grade Scale pages call `.toString()` on `minMarks`/`maxMarks`/`gradePoint` before rendering, per Phase 1's Global Constraint on Prisma `Decimal` fields.

