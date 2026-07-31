import { prisma } from "@/lib/prisma";

// Sections and Exams default to the active term so a Manager is not staring at
// every term at once. "all" opts out; an explicit id wins; otherwise fall back
// to the active term, and to showing everything when no term is active.
export async function resolveTermFilter(termIdParam?: string): Promise<string | undefined> {
  if (termIdParam === "all") return undefined;
  if (termIdParam) return termIdParam;

  const active = await prisma.term.findFirst({ where: { isActive: true }, select: { id: true } });
  return active?.id;
}
