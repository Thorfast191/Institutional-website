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
