"use server";

import { redirect } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { isRegistrationOpen } from "@/lib/student-term";

const CLOSED_MESSAGE = "Registration is closed for the current term.";

export async function enrollInSection(sectionId: string) {
  const { profile } = await requireStudentProfile();

  const activeTerm = await getActiveTerm();
  // Re-checked here, not just in the page: a stale form submitted after the
  // window shut must be rejected. Hiding the button is convenience, not
  // enforcement.
  if (!isRegistrationOpen(activeTerm, new Date())) {
    redirect(`/student/register?error=${encodeURIComponent(CLOSED_MESSAGE)}`);
  }

  // The section must belong to the active term — a student cannot register for
  // a past term's section by passing its id.
  const section = await prisma.section.findFirst({
    where: { id: sectionId, termId: activeTerm!.id },
    select: { id: true },
  });
  if (!section) {
    redirect(
      `/student/register?error=${encodeURIComponent(
        "That section is not open for registration."
      )}`
    );
  }

  // @@unique([studentId, sectionId]) means re-enrolling after a drop must
  // update the existing row; an insert would violate the constraint.
  await prisma.enrollment.upsert({
    where: { studentId_sectionId: { studentId: profile.id, sectionId } },
    create: { studentId: profile.id, sectionId, status: EnrollmentStatus.ENROLLED },
    update: {
      status: EnrollmentStatus.ENROLLED,
      droppedAt: null,
      droppedBy: null,
      enrolledAt: new Date(),
    },
  });

  redirect("/student/register");
}

export async function dropOwnEnrollment(sectionId: string) {
  const { session, profile } = await requireStudentProfile();

  const activeTerm = await getActiveTerm();
  if (!isRegistrationOpen(activeTerm, new Date())) {
    redirect(
      `/student/register?error=${encodeURIComponent(
        "Registration is closed — ask the office to drop this course."
      )}`
    );
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: profile.id, sectionId, status: EnrollmentStatus.ENROLLED },
    select: { id: true },
  });
  if (!enrollment) {
    redirect(
      `/student/register?error=${encodeURIComponent("You are not enrolled in that section.")}`
    );
  }

  // Same audit fields the Manager's force-drop writes; droppedBy is the
  // student's own user id, taken from the session.
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: EnrollmentStatus.DROPPED,
      droppedAt: new Date(),
      droppedBy: session.user.id,
    },
  });

  redirect("/student/register");
}
