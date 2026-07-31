"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { programSchema } from "@/lib/validation/program";
import { isUniqueConstraintError, isRestrictConstraintError } from "@/lib/prisma-errors";

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
