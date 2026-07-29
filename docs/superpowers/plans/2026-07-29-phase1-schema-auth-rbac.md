# Phase 1: Schema, Auth & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js project with a complete Prisma/PostgreSQL schema, Auth.js credentials+JWT authentication, role-based middleware protection, a realistic seed dataset, and a bare authenticated shell page per role — the foundation every later dashboard-specific phase builds on.

**Architecture:** Server Components read directly from Prisma; the only mutations in this phase (login, logout) are Server Actions calling Auth.js's `signIn`/`signOut`. Auth.js config is split into an Edge-safe `auth.config.ts` (consumed by `middleware.ts`) and a Node-only `auth.ts` (adds the Prisma-backed Credentials provider), so Prisma's Node-only client never gets bundled into the Edge middleware. Middleware enforces role-to-path-prefix access; each protected layout/Server Component re-checks the session as defense-in-depth.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, PostgreSQL + Prisma 6, Auth.js v5 (Credentials provider, JWT sessions), Tailwind CSS v4, bcryptjs, zod, Vitest for unit tests.

## Global Constraints

- No REST/tRPC API layer — the only Route Handler is `/api/auth/[...nextauth]`; everything else is Server Components + Server Actions. (design spec, Tech Stack)
- All Prisma relations use `Restrict`-on-delete — no cascading deletes anywhere in the schema. Note: Prisma's *implicit* default is `Restrict` only for mandatory relations; optional relations default to `SetNull`, so the schema's one optional relation (`Enrollment.droppedByUser`) needs `onDelete: Restrict` set explicitly (see Task 2's schema). (design spec, Key Decisions — corrected during Task 2 implementation after review caught the implicit-default gap)
- `User` accounts are removed via `isActive = false`; never a hard delete — `gradedBy`/`recordedBy`/`droppedBy` must always stay resolvable. (design spec, Key Decisions)
- Exactly one `Term.isActive = true` at a time, enforced at the application layer, not a DB constraint. (design spec, Key Decisions)
- Admin's UI is scoped to `/admin` only in v1 — no merged cross-role views. (design spec, Key Decisions)
- "System settings" (Admin-exclusive) = User accounts, GradeScale config, Department/Program structure. Subjects/Sections/Routines/Exams/Fees are Manager-owned operationally. (design spec, Key Decisions)
- No public self-registration for accounts (Admin-provisioned only); no seat-limit or prerequisite checks on student course self-registration in v1. (design spec, Key Decisions)
- **Forward-looking, not needed yet:** `FeeItem.amount`, `Payment.amount`, and `Grade.marks`/`gradePoint` are Prisma `Decimal` fields (see inline comments in Task 2's schema). Prisma's `Decimal` type isn't directly serializable to a Client Component — later phases that render these values must call `.toString()`/`.toNumber()` first. Not applicable in Phase 1 since its dashboard pages are static placeholders that never touch these fields.
- A generic `requireRole()` Server Action guard is **deferred** to whichever future phase introduces the first role-gated mutation (e.g., student course registration). Phase 1's only mutations are login/logout, which don't need a role check — building it now would have no caller. `lib/permissions.ts` in this phase only covers path-based checks for middleware.

## Prerequisites (manual, before Task 1)

1. Node.js ≥ 18.18 installed.
2. A reachable PostgreSQL database and its connection string. Any of: local Postgres, Docker (`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`), or the `neon:claimable-postgres` skill for an instant zero-signup dev database.
3. Nothing else — Task 1 creates the project files.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `next-env.d.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a runnable, empty Next.js 15 App Router project (`npm run dev` serves a blank app) that every later task builds inside.

- [ ] **Step 1: Initialize package.json and install dependencies**

Run:
```bash
npm init -y
npm install next@15 react@19 react-dom@19 next-auth@beta @prisma/client@6 bcryptjs zod
npm install -D typescript@5 @types/node @types/react @types/react-dom @types/bcryptjs prisma@6 tailwindcss@4 @tailwindcss/postcss postcss eslint eslint-config-next vitest tsx
```

- [ ] **Step 2: Edit package.json scripts and prisma seed config**

Open `package.json` and set the `"scripts"` and add a top-level `"prisma"` key:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write next.config.ts**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Write postcss.config.mjs and app/globals.css (Tailwind v4)**

`postcss.config.mjs`:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`app/globals.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 6: Write next-env.d.ts**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
```

- [ ] **Step 7: Write app/layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Institutional Website",
  description: "Academic institution management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Write .gitignore**

```
node_modules
.next
.env
.env*.local
*.tsbuildinfo
```

- [ ] **Step 9: Write .env.example**

```
DATABASE_URL="postgresql://user:password@localhost:5432/institutional_website?schema=public"
AUTH_SECRET="run: npx auth secret"
```

- [ ] **Step 10: Copy .env.example to .env and fill in real values**

```bash
cp .env.example .env
npx auth secret
```
Then edit `.env`: paste your real `DATABASE_URL` from the Prerequisites step. `npx auth secret` writes `AUTH_SECRET` into `.env` automatically.

- [ ] **Step 11: Verify the scaffold builds**

Run: `npm run build`
Expected: build succeeds (a default 404 page is fine — no `app/page.tsx` exists yet).

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs .gitignore .env.example app/globals.css app/layout.tsx next-env.d.ts
git commit -m "Scaffold Next.js 15 + TypeScript + Tailwind v4 project"
```

---

### Task 2: Prisma schema and initial migration

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `DATABASE_URL` from `.env` (Task 1)
- Produces: the full set of Prisma models (`User`, `Department`, `Program`, `Term`, `Subject`, `TeacherProfile`, `StudentProfile`, `Section`, `Routine`, `Exam`, `Enrollment`, `Grade`, `GradeScale`, `FeeItem`, `Payment`) and enums (`Role`, `EnrollmentStatus`, `FeeType`, `FeeStatus`, `PaymentMethod`, `ExamType`, `DayOfWeek`) that every later task imports from `@prisma/client`.

- [ ] **Step 1: Write prisma/schema.prisma**

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
  id            String           @id @default(cuid())
  studentId     String
  student       StudentProfile   @relation(fields: [studentId], references: [id])
  sectionId     String
  section       Section          @relation(fields: [sectionId], references: [id])
  status        EnrollmentStatus @default(ENROLLED)
  enrolledAt    DateTime         @default(now())
  droppedAt     DateTime?
  droppedBy     String?
  droppedByUser User?            @relation(fields: [droppedBy], references: [id], onDelete: Restrict)

  grade Grade?

  @@unique([studentId, sectionId])
}

model Grade {
  id           String     @id @default(cuid())
  enrollmentId String     @unique
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id])
  marks        Decimal // Prisma Decimal — .toString()/.toNumber() before passing to a Client Component
  letterGrade  String
  gradePoint   Decimal // Prisma Decimal — .toString()/.toNumber() before passing to a Client Component
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
  amount    Decimal // Prisma Decimal — .toString()/.toNumber() before passing to a Client Component
  dueDate   DateTime
  status    FeeStatus      @default(UNPAID)

  payments Payment[]
}

model Payment {
  id             String        @id @default(cuid())
  feeItemId      String
  feeItem        FeeItem       @relation(fields: [feeItemId], references: [id])
  amount         Decimal // Prisma Decimal — .toString()/.toNumber() before passing to a Client Component
  paidAt         DateTime      @default(now())
  method         PaymentMethod
  reference      String?
  recordedBy     String
  recordedByUser User          @relation(fields: [recordedBy], references: [id])
}
```

- [ ] **Step 2: Run the initial migration**

Run: `npx prisma migrate dev --name init`
Expected: "Your database is now in sync with your schema." and a new `prisma/migrations/<timestamp>_init/` folder is created. This also generates the Prisma Client.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add Prisma schema and initial migration"
```

---

### Task 3: Prisma client singleton

**Files:**
- Create: `lib/prisma.ts`

**Interfaces:**
- Consumes: `@prisma/client` generated types (Task 2)
- Produces: `prisma` (singleton `PrismaClient` instance) — imported by every task that touches the database.

- [ ] **Step 1: Write lib/prisma.ts**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/prisma.ts
git commit -m "Add Prisma client singleton"
```

---

### Task 4: Password hashing utility

**Files:**
- Create: `lib/password.ts`
- Test: `lib/password.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: `bcryptjs` (Task 1)
- Produces: `hashPassword(plainPassword: string): Promise<string>`, `verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean>` — used by Task 6 (Auth.js `authorize()`) and Task 10 (seed script).

- [ ] **Step 1: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("verifies a matching password against its hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    const hash1 = await hashPassword("same-input");
    const hash2 = await hashPassword("same-input");
    expect(hash1).not.toBe(hash2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/password.test.ts`
Expected: FAIL with "Cannot find module '@/lib/password'" (file doesn't exist yet).

- [ ] **Step 4: Write lib/password.ts**

```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/password.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts lib/password.ts lib/password.test.ts
git commit -m "Add password hashing utility with tests"
```

---

### Task 5: Path-based RBAC utility

**Files:**
- Create: `lib/permissions.ts`
- Test: `lib/permissions.test.ts`

**Interfaces:**
- Consumes: `Role` enum from `@prisma/client` (Task 2)
- Produces: `dashboardPathForRole(role: Role): string`, `isPathAllowedForRole(pathname: string, role: Role): boolean` — used by Task 7 (`middleware.ts`) and Task 8 (root page redirect).

- [ ] **Step 1: Write the failing test**

```ts
// lib/permissions.test.ts
import { describe, it, expect } from "vitest";
import { dashboardPathForRole, isPathAllowedForRole } from "@/lib/permissions";

describe("dashboardPathForRole", () => {
  it("maps each role to its own dashboard path", () => {
    expect(dashboardPathForRole("ADMIN")).toBe("/admin");
    expect(dashboardPathForRole("MANAGER")).toBe("/manager");
    expect(dashboardPathForRole("TEACHER")).toBe("/teacher");
    expect(dashboardPathForRole("STUDENT")).toBe("/student");
  });
});

describe("isPathAllowedForRole", () => {
  it("allows a role into its own dashboard subtree", () => {
    expect(isPathAllowedForRole("/admin/users", "ADMIN")).toBe(true);
    expect(isPathAllowedForRole("/student/grades", "STUDENT")).toBe(true);
  });

  it("blocks a role from another role's dashboard", () => {
    expect(isPathAllowedForRole("/admin/users", "STUDENT")).toBe(false);
    expect(isPathAllowedForRole("/manager/fees", "TEACHER")).toBe(false);
  });

  it("does not treat a sibling path with the same string prefix as a match", () => {
    expect(isPathAllowedForRole("/administration", "ADMIN")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/permissions.test.ts`
Expected: FAIL with "Cannot find module '@/lib/permissions'"

- [ ] **Step 3: Write lib/permissions.ts**

```ts
import type { Role } from "@prisma/client";

const DASHBOARD_PATH_BY_ROLE: Record<Role, string> = {
  ADMIN: "/admin",
  MANAGER: "/manager",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

export function dashboardPathForRole(role: Role): string {
  return DASHBOARD_PATH_BY_ROLE[role];
}

export function isPathAllowedForRole(pathname: string, role: Role): boolean {
  const base = dashboardPathForRole(role);
  return pathname === base || pathname.startsWith(base + "/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/permissions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/permissions.ts lib/permissions.test.ts
git commit -m "Add path-based RBAC utility with tests"
```

---

### Task 6: Auth.js configuration

**Files:**
- Create: `auth.config.ts`
- Test: `auth.config.test.ts`
- Create: `auth.ts`
- Create: `types/next-auth.d.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `verifyPassword` (Task 4)
- Produces: `authConfig` (Edge-safe, no provider with DB access) from `auth.config.ts` — consumed by Task 7's `middleware.ts`. `auth`, `signIn`, `signOut`, `handlers` from `auth.ts` — consumed by Task 8 (login page) and Task 9 (dashboard layout).

- [ ] **Step 1: Write the failing test for the JWT/session callbacks**

```ts
// auth.config.test.ts
import { describe, it, expect } from "vitest";
import { jwtCallback, sessionCallback } from "@/auth.config";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";

describe("jwtCallback", () => {
  it("copies id and role from user onto the token at sign-in", () => {
    const token = {} as JWT;
    const user = { id: "user-1", role: "TEACHER" } as User;

    const result = jwtCallback({ token, user });

    expect(result.id).toBe("user-1");
    expect(result.role).toBe("TEACHER");
  });

  it("leaves an existing token unchanged when no user is passed", () => {
    const token = { id: "user-1", role: "TEACHER" } as JWT;

    const result = jwtCallback({ token });

    expect(result.id).toBe("user-1");
    expect(result.role).toBe("TEACHER");
  });
});

describe("sessionCallback", () => {
  it("copies id and role from the token onto session.user", () => {
    const session = { user: {}, expires: "" } as unknown as Session;
    const token = { id: "user-1", role: "ADMIN" } as JWT;

    const result = sessionCallback({ session, token });

    expect(result.user.id).toBe("user-1");
    expect(result.user.role).toBe("ADMIN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run auth.config.test.ts`
Expected: FAIL with "Cannot find module '@/auth.config'"

- [ ] **Step 3: Write auth.config.ts**

```ts
import type { NextAuthConfig, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

export function jwtCallback({ token, user }: { token: JWT; user?: User }): JWT {
  if (user) {
    token.id = user.id as string;
    token.role = user.role;
  }
  return token;
}

export function sessionCallback({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Session {
  if (session.user) {
    session.user.id = token.id;
    session.user.role = token.role;
  }
  return session;
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 4: Write types/next-auth.d.ts**

```ts
import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run auth.config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write auth.ts (Node runtime, adds the Credentials provider)**

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
```

- [ ] **Step 7: Write app/api/auth/[...nextauth]/route.ts**

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 8: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add auth.config.ts auth.config.test.ts auth.ts types/next-auth.d.ts app/api/auth
git commit -m "Add Auth.js credentials + JWT configuration"
```

---

### Task 7: RBAC middleware

**Files:**
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `authConfig` (Task 6), `isPathAllowedForRole`, `dashboardPathForRole` (Task 5)
- Produces: route protection on `/admin/**`, `/manager/**`, `/teacher/**`, `/student/**` — every later dashboard task relies on this being in place.

- [ ] **Step 1: Write middleware.ts**

```ts
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { dashboardPathForRole, isPathAllowedForRole } from "@/lib/permissions";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role;

  if (!role) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!isPathAllowedForRole(pathname, role)) {
    return NextResponse.redirect(new URL(dashboardPathForRole(role), req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/manager/:path*", "/teacher/:path*", "/student/:path*"],
};
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (Runtime behavior is verified in Task 11 once there are pages to protect.)

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "Add RBAC middleware for dashboard route prefixes"
```

---

### Task 8: Login page and root redirect

**Files:**
- Create: `lib/validation/login.ts`
- Create: `app/(public)/login/page.tsx`
- Create: `app/page.tsx`

**Interfaces:**
- Consumes: `signIn` (Task 6), `auth` (Task 6), `dashboardPathForRole` (Task 5)
- Produces: a working `/login` page and a `/` route that redirects to the correct dashboard or to `/login`.

- [ ] **Step 1: Write lib/validation/login.ts**

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
```

- [ ] **Step 2: Write app/(public)/login/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/login";

async function loginAction(formData: FormData) {
  "use server";

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid-input");
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=invalid-credentials");
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        action={loginAction}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Sign in</h1>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "invalid-input"
              ? "Enter a valid email and password."
              : "Incorrect email or password."}
          </p>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Write app/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { dashboardPathForRole } from "@/lib/permissions";

export default async function Home() {
  const session = await auth();

  if (session?.user?.role) {
    redirect(dashboardPathForRole(session.user.role));
  }

  redirect("/login");
}
```

- [ ] **Step 4: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/validation "app/(public)" app/page.tsx
git commit -m "Add login page and role-aware root redirect"
```

---

### Task 9: Dashboard shell layout and per-role pages

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `app/(dashboard)/admin/page.tsx`
- Create: `app/(dashboard)/manager/page.tsx`
- Create: `app/(dashboard)/teacher/page.tsx`
- Create: `app/(dashboard)/student/page.tsx`

**Interfaces:**
- Consumes: `auth`, `signOut` (Task 6)
- Produces: the authenticated shell every future dashboard-specific phase adds pages into.

- [ ] **Step 1: Write app/(dashboard)/layout.tsx**

```tsx
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

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
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Write app/(dashboard)/admin/page.tsx**

```tsx
export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Admin Dashboard</h1>
      <p className="mt-2 text-slate-600">
        User management, departments, programs, and grade scale configuration
        will live here.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Write app/(dashboard)/manager/page.tsx**

```tsx
export default function ManagerDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Manager Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Subjects, sections, routines, exams, and fee management will live
        here.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Write app/(dashboard)/teacher/page.tsx**

```tsx
export default function TeacherDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Teacher Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Your assigned sections, class rosters, and grade entry will live
        here.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Write app/(dashboard)/student/page.tsx**

```tsx
export default function StudentDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Student Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Your grades, enrolled courses, routine, exam schedule, and dues will
        live here.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)"
git commit -m "Add dashboard shell layout and bare per-role pages"
```

---

### Task 10: Seed script

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `hashPassword` (Task 4), Prisma models/enums (Task 2)
- Produces: a populated database and printed login credentials — used for Task 11's manual verification and every later phase's development.

- [ ] **Step 1: Write prisma/seed.ts**

```ts
import {
  PrismaClient,
  Role,
  FeeType,
  FeeStatus,
  PaymentMethod,
  ExamType,
  EnrollmentStatus,
  DayOfWeek,
} from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "Passw0rd!";

async function createUser(params: { name: string; email: string; role: Role }) {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  return prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      role: params.role,
      passwordHash,
    },
  });
}

async function main() {
  console.log("Seeding database...");

  const cse = await prisma.department.create({
    data: { name: "Computer Science & Engineering", code: "CSE" },
  });
  const eee = await prisma.department.create({
    data: { name: "Electrical & Electronic Engineering", code: "EEE" },
  });

  const bscCse = await prisma.program.create({
    data: { name: "BSc in Computer Science & Engineering", code: "BSC-CSE", departmentId: cse.id },
  });
  const mscCse = await prisma.program.create({
    data: { name: "MSc in Computer Science & Engineering", code: "MSC-CSE", departmentId: cse.id },
  });
  const bscEee = await prisma.program.create({
    data: { name: "BSc in Electrical & Electronic Engineering", code: "BSC-EEE", departmentId: eee.id },
  });

  const pastTerm = await prisma.term.create({
    data: {
      name: "Spring 2026",
      startDate: new Date("2026-01-05"),
      endDate: new Date("2026-04-30"),
      isActive: false,
      registrationOpensAt: new Date("2025-12-15"),
      registrationClosesAt: new Date("2026-01-10"),
    },
  });
  const currentTerm = await prisma.term.create({
    data: {
      name: "Summer 2026",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-09-15"),
      isActive: true,
      registrationOpensAt: new Date("2026-07-01"),
      registrationClosesAt: new Date("2026-08-15"),
    },
  });

  await prisma.gradeScale.createMany({
    data: [
      { minMarks: 90, maxMarks: 100, letterGrade: "A+", gradePoint: 4.0 },
      { minMarks: 85, maxMarks: 89.99, letterGrade: "A", gradePoint: 3.75 },
      { minMarks: 80, maxMarks: 84.99, letterGrade: "A-", gradePoint: 3.5 },
      { minMarks: 75, maxMarks: 79.99, letterGrade: "B+", gradePoint: 3.25 },
      { minMarks: 70, maxMarks: 74.99, letterGrade: "B", gradePoint: 3.0 },
      { minMarks: 65, maxMarks: 69.99, letterGrade: "B-", gradePoint: 2.75 },
      { minMarks: 60, maxMarks: 64.99, letterGrade: "C+", gradePoint: 2.5 },
      { minMarks: 50, maxMarks: 59.99, letterGrade: "C", gradePoint: 2.0 },
      { minMarks: 40, maxMarks: 49.99, letterGrade: "D", gradePoint: 1.0 },
      { minMarks: 0, maxMarks: 39.99, letterGrade: "F", gradePoint: 0.0 },
    ],
  });

  const subjectsData = [
    { name: "Structured Programming", code: "CSE101", credits: 3, programId: bscCse.id },
    { name: "Data Structures", code: "CSE201", credits: 3, programId: bscCse.id },
    { name: "Algorithms", code: "CSE301", credits: 3, programId: bscCse.id },
    { name: "Database Systems", code: "CSE302", credits: 3, programId: bscCse.id },
    { name: "Advanced Machine Learning", code: "CSE501", credits: 3, programId: mscCse.id },
    { name: "Circuit Analysis", code: "EEE101", credits: 3, programId: bscEee.id },
    { name: "Digital Logic Design", code: "EEE201", credits: 3, programId: bscEee.id },
  ];
  const subjects = [];
  for (const s of subjectsData) {
    subjects.push(await prisma.subject.create({ data: s }));
  }
  const [cse101, cse201, cse301, cse302, , eee101, eee201] = subjects;

  const admin = await createUser({ name: "Ayesha Rahman", email: "admin@school.edu", role: Role.ADMIN });
  const manager = await createUser({ name: "Farhan Kabir", email: "manager@school.edu", role: Role.MANAGER });

  const teacherUsersData = [
    { name: "Dr. Nusrat Jahan", email: "nusrat.jahan@school.edu", employeeId: "EMP-001", departmentId: cse.id, designation: "Associate Professor" },
    { name: "Dr. Kamal Hossain", email: "kamal.hossain@school.edu", employeeId: "EMP-002", departmentId: cse.id, designation: "Assistant Professor" },
    { name: "Dr. Shirin Akter", email: "shirin.akter@school.edu", employeeId: "EMP-003", departmentId: eee.id, designation: "Professor" },
  ];
  const teacherProfiles = [];
  for (const t of teacherUsersData) {
    const user = await createUser({ name: t.name, email: t.email, role: Role.TEACHER });
    teacherProfiles.push(
      await prisma.teacherProfile.create({
        data: {
          userId: user.id,
          employeeId: t.employeeId,
          departmentId: t.departmentId,
          designation: t.designation,
        },
      })
    );
  }
  const [teacherNusrat, teacherKamal, teacherShirin] = teacherProfiles;

  const sectionsData = [
    { subjectId: cse101.id, termId: pastTerm.id, teacherId: teacherNusrat.id, label: "A" },
    { subjectId: cse101.id, termId: currentTerm.id, teacherId: teacherNusrat.id, label: "A" },
    { subjectId: cse101.id, termId: currentTerm.id, teacherId: teacherKamal.id, label: "B" },
    { subjectId: cse201.id, termId: pastTerm.id, teacherId: teacherKamal.id, label: "A" },
    { subjectId: cse201.id, termId: currentTerm.id, teacherId: teacherKamal.id, label: "A" },
    { subjectId: cse301.id, termId: currentTerm.id, teacherId: teacherNusrat.id, label: "A" },
    { subjectId: cse302.id, termId: currentTerm.id, teacherId: teacherKamal.id, label: "A" },
    { subjectId: eee101.id, termId: currentTerm.id, teacherId: teacherShirin.id, label: "A" },
    { subjectId: eee201.id, termId: currentTerm.id, teacherId: teacherShirin.id, label: "A" },
  ];
  const createdSections = [];
  for (const s of sectionsData) {
    createdSections.push(await prisma.section.create({ data: s }));
  }
  const [
    cse101PastA,
    cse101CurA,
    cse101CurB,
    cse201PastA,
    cse201CurA,
    cse301CurA,
    cse302CurA,
    eee101CurA,
    eee201CurA,
  ] = createdSections;

  await prisma.routine.createMany({
    data: [
      { sectionId: cse101CurA.id, dayOfWeek: DayOfWeek.SUNDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 301" },
      { sectionId: cse101CurA.id, dayOfWeek: DayOfWeek.TUESDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 301" },
      { sectionId: cse101CurB.id, dayOfWeek: DayOfWeek.MONDAY, startTime: new Date("1970-01-01T11:00:00Z"), endTime: new Date("1970-01-01T12:20:00Z"), room: "Room 302" },
      { sectionId: cse201CurA.id, dayOfWeek: DayOfWeek.SUNDAY, startTime: new Date("1970-01-01T11:00:00Z"), endTime: new Date("1970-01-01T12:20:00Z"), room: "Room 303" },
      { sectionId: cse301CurA.id, dayOfWeek: DayOfWeek.WEDNESDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 304" },
      { sectionId: cse302CurA.id, dayOfWeek: DayOfWeek.THURSDAY, startTime: new Date("1970-01-01T13:00:00Z"), endTime: new Date("1970-01-01T14:20:00Z"), room: "Lab 1" },
      { sectionId: eee101CurA.id, dayOfWeek: DayOfWeek.MONDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 201" },
      { sectionId: eee201CurA.id, dayOfWeek: DayOfWeek.WEDNESDAY, startTime: new Date("1970-01-01T11:00:00Z"), endTime: new Date("1970-01-01T12:20:00Z"), room: "Room 202" },
    ],
  });

  await prisma.exam.createMany({
    data: [
      { subjectId: cse101.id, termId: currentTerm.id, examType: ExamType.QUIZ, sequence: 1, date: new Date("2026-07-20"), startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T09:30:00Z"), room: "Room 301" },
      { subjectId: cse101.id, termId: currentTerm.id, examType: ExamType.QUIZ, sequence: 2, date: new Date("2026-08-10"), startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T09:30:00Z"), room: "Room 301" },
      { subjectId: cse101.id, termId: currentTerm.id, examType: ExamType.MIDTERM, sequence: 1, date: new Date("2026-08-01"), startTime: new Date("1970-01-01T10:00:00Z"), endTime: new Date("1970-01-01T12:00:00Z"), room: "Exam Hall 1" },
      { subjectId: cse201.id, termId: currentTerm.id, examType: ExamType.MIDTERM, sequence: 1, date: new Date("2026-08-02"), startTime: new Date("1970-01-01T10:00:00Z"), endTime: new Date("1970-01-01T12:00:00Z"), room: "Exam Hall 2" },
      { subjectId: cse101.id, termId: pastTerm.id, examType: ExamType.FINAL, sequence: 1, date: new Date("2026-04-25"), startTime: new Date("1970-01-01T10:00:00Z"), endTime: new Date("1970-01-01T13:00:00Z"), room: "Exam Hall 1" },
    ],
  });

  const studentUsersData = [
    { name: "Tanvir Ahmed", email: "tanvir.ahmed@student.school.edu", studentId: "STU-1001", programId: bscCse.id },
    { name: "Sadia Islam", email: "sadia.islam@student.school.edu", studentId: "STU-1002", programId: bscCse.id },
    { name: "Rakib Hasan", email: "rakib.hasan@student.school.edu", studentId: "STU-1003", programId: bscCse.id },
    { name: "Nabila Yasmin", email: "nabila.yasmin@student.school.edu", studentId: "STU-1004", programId: bscCse.id },
    { name: "Imran Chowdhury", email: "imran.chowdhury@student.school.edu", studentId: "STU-1005", programId: bscEee.id },
    { name: "Farzana Akter", email: "farzana.akter@student.school.edu", studentId: "STU-1006", programId: bscEee.id },
  ];
  const studentProfiles = [];
  for (const s of studentUsersData) {
    const user = await createUser({ name: s.name, email: s.email, role: Role.STUDENT });
    studentProfiles.push(
      await prisma.studentProfile.create({
        data: { userId: user.id, studentId: s.studentId, programId: s.programId },
      })
    );
  }
  const [tanvir, sadia, rakib, nabila, imran, farzana] = studentProfiles;

  const currentEnrollments = [
    { studentId: tanvir.id, sectionId: cse101CurA.id },
    { studentId: sadia.id, sectionId: cse101CurA.id },
    { studentId: rakib.id, sectionId: cse101CurB.id },
    { studentId: tanvir.id, sectionId: cse201CurA.id },
    { studentId: nabila.id, sectionId: cse301CurA.id },
    { studentId: sadia.id, sectionId: cse302CurA.id },
    { studentId: imran.id, sectionId: eee101CurA.id },
    { studentId: farzana.id, sectionId: eee201CurA.id },
  ];
  for (const e of currentEnrollments) {
    await prisma.enrollment.create({ data: { ...e, status: EnrollmentStatus.ENROLLED } });
  }

  // Force-dropped enrollment — demonstrates the audit trail.
  await prisma.enrollment.create({
    data: {
      studentId: rakib.id,
      sectionId: cse201CurA.id,
      status: EnrollmentStatus.DROPPED,
      droppedAt: new Date("2026-07-15"),
      droppedBy: manager.id,
    },
  });

  const pastEnrollment1 = await prisma.enrollment.create({
    data: { studentId: tanvir.id, sectionId: cse101PastA.id, status: EnrollmentStatus.COMPLETED },
  });
  const pastEnrollment2 = await prisma.enrollment.create({
    data: { studentId: sadia.id, sectionId: cse101PastA.id, status: EnrollmentStatus.COMPLETED },
  });
  const pastEnrollment3 = await prisma.enrollment.create({
    data: { studentId: rakib.id, sectionId: cse201PastA.id, status: EnrollmentStatus.COMPLETED },
  });

  await prisma.grade.createMany({
    data: [
      { enrollmentId: pastEnrollment1.id, marks: 92, letterGrade: "A+", gradePoint: 4.0, gradedBy: teacherNusrat.userId },
      { enrollmentId: pastEnrollment2.id, marks: 78, letterGrade: "B+", gradePoint: 3.25, gradedBy: teacherNusrat.userId },
      { enrollmentId: pastEnrollment3.id, marks: 64, letterGrade: "C+", gradePoint: 2.5, gradedBy: teacherKamal.userId },
    ],
  });

  const [tanvirTuition, tanvirLab, sadiaTuition] = await Promise.all([
    prisma.feeItem.create({ data: { studentId: tanvir.id, termId: currentTerm.id, feeType: FeeType.TUITION, amount: 45000, dueDate: new Date("2026-07-10") } }),
    prisma.feeItem.create({ data: { studentId: tanvir.id, termId: currentTerm.id, feeType: FeeType.LAB, amount: 3000, dueDate: new Date("2026-07-10") } }),
    prisma.feeItem.create({ data: { studentId: sadia.id, termId: currentTerm.id, feeType: FeeType.TUITION, amount: 45000, dueDate: new Date("2026-07-10") } }),
  ]);
  await prisma.feeItem.create({ data: { studentId: rakib.id, termId: currentTerm.id, feeType: FeeType.TUITION, amount: 45000, dueDate: new Date("2026-07-10") } });
  const nabilaLibrary = await prisma.feeItem.create({ data: { studentId: nabila.id, termId: currentTerm.id, feeType: FeeType.LIBRARY, amount: 1500, dueDate: new Date("2026-07-15") } });

  await prisma.payment.create({
    data: { feeItemId: tanvirTuition.id, amount: 45000, method: PaymentMethod.BANK, reference: "TXN-0001", recordedBy: manager.id },
  });
  await prisma.feeItem.update({ where: { id: tanvirTuition.id }, data: { status: FeeStatus.PAID } });
  // tanvirLab is left UNPAID (no payment recorded).
  void tanvirLab;

  await prisma.payment.create({
    data: { feeItemId: sadiaTuition.id, amount: 20000, method: PaymentMethod.CASH, recordedBy: manager.id },
  });
  await prisma.feeItem.update({ where: { id: sadiaTuition.id }, data: { status: FeeStatus.PARTIAL } });

  await prisma.payment.create({
    data: { feeItemId: nabilaLibrary.id, amount: 1500, method: PaymentMethod.ONLINE, reference: "TXN-0002", recordedBy: manager.id },
  });
  await prisma.feeItem.update({ where: { id: nabilaLibrary.id }, data: { status: FeeStatus.PAID } });

  console.log("\nSeed complete.");
  console.log(`Password for every account below: ${DEFAULT_PASSWORD}\n`);
  console.log(`Admin:    ${admin.email}`);
  console.log(`Manager:  ${manager.email}`);
  teacherUsersData.forEach((t) => console.log(`Teacher:  ${t.email}`));
  studentUsersData.forEach((s) => console.log(`Student:  ${s.email}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run the seed script**

Run: `npx prisma db seed`
Expected: "Seed complete." followed by the list of emails, ending in a clean exit (no unhandled errors).

- [ ] **Step 3: Spot-check row counts**

Run:
```bash
npx tsx -e "
import { prisma } from './lib/prisma';
Promise.all([
  prisma.user.count(),
  prisma.enrollment.count(),
  prisma.exam.count(),
  prisma.feeItem.count(),
  prisma.payment.count(),
]).then(([users, enrollments, exams, feeItems, payments]) => {
  console.log({ users, enrollments, exams, feeItems, payments });
  process.exit(0);
});
"
```
Expected: `{ users: 11, enrollments: 12, exams: 5, feeItems: 5, payments: 3 }` — 11 users is 1 admin + 1 manager + 3 teachers + 6 students; 12 enrollments is 8 current + 1 dropped + 3 past-completed.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "Add seed script with sample departments, programs, terms, and users"
```

---

### Task 11: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: confidence that auth + RBAC work end-to-end before later phases build on top.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`.

- [ ] **Step 2: Verify unauthenticated access is blocked**

In a browser, visit `http://localhost:3000/admin`.
Expected: redirected to `/login?callbackUrl=%2Fadmin`.

- [ ] **Step 3: Verify login and role-correct redirect, for each seeded role**

Log in at `/login` with each of these (password `Passw0rd!` for all):
- `admin@school.edu` → expect redirect to `/admin`, page shows "Admin Dashboard".
- `manager@school.edu` → expect redirect to `/manager`, page shows "Manager Dashboard".
- `nusrat.jahan@school.edu` → expect redirect to `/teacher`, page shows "Teacher Dashboard".
- `tanvir.ahmed@student.school.edu` → expect redirect to `/student`, page shows "Student Dashboard".

Sign out between each (the "Sign out" button in the header) before logging in as the next user.

- [ ] **Step 4: Verify cross-role blocking**

While logged in as `tanvir.ahmed@student.school.edu`, navigate directly to `http://localhost:3000/admin`.
Expected: redirected back to `/student`, not shown the Admin page.

- [ ] **Step 5: Verify inactive-account and wrong-password rejection**

At `/login`, submit `admin@school.edu` with an incorrect password.
Expected: redirected to `/login?error=invalid-credentials`, page shows "Incorrect email or password."

- [ ] **Step 6: Run the full automated test suite one more time**

Run: `npm test`
Expected: all Vitest suites pass (password, permissions, auth.config).

- [ ] **Step 7: Final commit**

If Steps 2–6 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed, this step is a no-op — Phase 1 is complete as of Task 10's commit.

---

## Self-Review Notes

- **Spec coverage:** every entity, enum, relation, and constraint from the design spec's Prisma schema section is reproduced verbatim in Task 2, including the `Exam.sequence` fix and the `Enrollment.droppedBy/droppedAt` / `Payment.recordedBy` audit fields from the spec's revision history. The auth flow (Task 6–8), RBAC middleware (Task 7), role permission matrix's path-level enforcement (Task 5/7), routing structure (Tasks 8–9), and seed script scope (Task 10) are each covered by a dedicated task.
- **Deliberately deferred:** the spec's "Server Actions... non-negotiable on grade writes and fee/payment writes" and the course-registration Server Action are Teacher/Student dashboard functionality, out of scope for "schema, auth, RBAC middleware, seed script, bare dashboard shells" — noted under Global Constraints so it doesn't read as an oversight.
- **Type consistency checked:** `Role`/`isPathAllowedForRole`/`dashboardPathForRole` signatures in Task 5 match their usage in Task 7 (middleware) and Task 8 (root page). `jwtCallback`/`sessionCallback` signatures in Task 6 match the `types/next-auth.d.ts` augmentation. `hashPassword`/`verifyPassword` signatures in Task 4 match their usage in Task 6 (`authorize`) and Task 10 (seed).
