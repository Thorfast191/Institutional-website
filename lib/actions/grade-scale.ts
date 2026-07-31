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
