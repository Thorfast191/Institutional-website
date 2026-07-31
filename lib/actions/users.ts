"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { createUserSchema, editUserSchema, resetPasswordSchema } from "@/lib/validation/user";
import { hashPassword } from "@/lib/password";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

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

  // Role is immutable after creation, so take it from the stored record rather
  // than the submitted form. The edit form carries role in a hidden field, and a
  // tampered or stale one would otherwise pick which profile table gets written:
  // a mismatched role silently skips the profile update, or fails on a profile
  // row that does not exist.
  const existing = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!existing) {
    redirect(`/admin/users?error=${encodeURIComponent("That user no longer exists.")}`);
  }

  const raw = {
    role: existing.role,
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
