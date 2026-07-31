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
