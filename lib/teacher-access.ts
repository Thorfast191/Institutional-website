import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

// requireRole proves a teacher is calling; it does not prove which sections
// are theirs. Every teacher read and write goes through one of these, so the
// ownership rule lives in exactly one place.
export async function requireTeacherProfile() {
  const session = await requireRole(["TEACHER"]);
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) {
    throw new Error("No teacher profile for this account");
  }
  return { session, teacherId: profile.id };
}

// Returns null rather than throwing so callers can render a friendly banner
// or a 404.
export async function findOwnedSection(sectionId: string, teacherId: string) {
  return prisma.section.findFirst({
    where: { id: sectionId, teacherId },
    select: { id: true },
  });
}

// The enrollmentId arrives from the form, so ownership is resolved by walking
// up to the section rather than trusting the id.
export async function findOwnedEnrollment(enrollmentId: string, teacherId: string) {
  return prisma.enrollment.findFirst({
    where: { id: enrollmentId, section: { teacherId } },
    select: { id: true, sectionId: true, status: true },
  });
}
