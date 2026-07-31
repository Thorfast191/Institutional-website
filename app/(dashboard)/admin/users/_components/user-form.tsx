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
