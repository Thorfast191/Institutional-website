import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

// Every student query filters on the profile resolved here, from the session.
// No page or action accepts a student id from the client.
export async function requireStudentProfile() {
  const session = await requireRole(["STUDENT"]);
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, studentId: true, programId: true },
  });
  if (!profile) {
    throw new Error("No student profile for this account");
  }
  return { session, profile };
}

export async function getActiveTerm() {
  return prisma.term.findFirst({ where: { isActive: true } });
}
