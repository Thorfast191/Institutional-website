"use server";

import { redirect } from "next/navigation";
import { Prisma, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { gradeSchema } from "@/lib/validation/grade";
import { findGradeBand } from "@/lib/grade-scale";
import { requireTeacherProfile, findOwnedEnrollment } from "@/lib/teacher-access";

export async function saveGrade(sectionId: string, formData: FormData) {
  const { session, teacherId } = await requireTeacherProfile();

  const parsed = gradeSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    marks: formData.get("marks"),
  });
  if (!parsed.success) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  // Authorization, not just authentication: a forged enrollmentId belonging to
  // another teacher's section finds nothing here and is rejected.
  const enrollment = await findOwnedEnrollment(parsed.data.enrollmentId, teacherId);
  if (!enrollment) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(
        "That student is not in one of your sections."
      )}`
    );
  }
  if (enrollment.status === EnrollmentStatus.DROPPED) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(
        "That student has dropped this section."
      )}`
    );
  }

  const marks = new Prisma.Decimal(parsed.data.marks);
  const bands = await prisma.gradeScale.findMany({ orderBy: { minMarks: "desc" } });
  const band = findGradeBand(marks, bands);
  if (!band) {
    redirect(
      `/teacher/sections/${sectionId}?error=${encodeURIComponent(
        `No grade band covers ${parsed.data.marks}. Ask an admin to check the grade scale.`
      )}`
    );
  }

  // Grade is 1:1 with Enrollment, so re-entering marks corrects the existing
  // row rather than creating a second one.
  await prisma.grade.upsert({
    where: { enrollmentId: enrollment.id },
    create: {
      enrollmentId: enrollment.id,
      marks: parsed.data.marks,
      letterGrade: band.letterGrade,
      gradePoint: band.gradePoint,
      gradedBy: session.user.id,
    },
    update: {
      marks: parsed.data.marks,
      letterGrade: band.letterGrade,
      gradePoint: band.gradePoint,
      gradedBy: session.user.id,
      gradedAt: new Date(),
    },
  });

  redirect(`/teacher/sections/${sectionId}`);
}
