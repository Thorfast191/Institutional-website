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
