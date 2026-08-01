"use server";

import { redirect } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

// droppedBy comes from the session, never from the form. A forged audit field
// would make the trail worse than not having one — this is the Phase 2
// client-controlled-role lesson applied to an audit record.
export async function dropEnrollment(id: string, sectionId: string) {
  const session = await requireRole(["MANAGER"]);

  const existing = await prisma.enrollment.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) {
    redirect(
      `/manager/sections/${sectionId}/enrollments?error=${encodeURIComponent(
        "That enrollment no longer exists."
      )}`
    );
  }
  if (existing.status === EnrollmentStatus.DROPPED) {
    redirect(
      `/manager/sections/${sectionId}/enrollments?error=${encodeURIComponent(
        "That enrollment is already dropped."
      )}`
    );
  }

  await prisma.enrollment.update({
    where: { id },
    data: {
      status: EnrollmentStatus.DROPPED,
      droppedAt: new Date(),
      droppedBy: session.user.id,
    },
  });

  redirect(`/manager/sections/${sectionId}/enrollments`);
}
