import { Prisma } from "@prisma/client";

type RegistrationWindow = {
  registrationOpensAt: Date;
  registrationClosesAt: Date;
};

// Both ends inclusive. `now` is a parameter rather than read inside so the
// boundary cases are testable — and so a Server Action and the page it
// rendered can agree on one instant.
export function isRegistrationOpen(
  window: RegistrationWindow | null,
  now: Date
): boolean {
  if (!window) return false;
  return (
    now.getTime() >= window.registrationOpensAt.getTime() &&
    now.getTime() <= window.registrationClosesAt.getTime()
  );
}

// Credit-weighted mean of grade points. Decimal throughout: a GPA is divided
// by a credit total that is routinely 9 or 12, so float drift would show up in
// the second decimal place a student actually reads.
export function calculateGpa(
  courses: { gradePoint: Prisma.Decimal; credits: number }[]
): Prisma.Decimal | null {
  if (courses.length === 0) return null;

  let weighted = new Prisma.Decimal(0);
  let totalCredits = new Prisma.Decimal(0);
  for (const c of courses) {
    weighted = weighted.plus(c.gradePoint.times(c.credits));
    totalCredits = totalCredits.plus(c.credits);
  }
  if (totalCredits.comparedTo(0) === 0) return null;

  return weighted.dividedBy(totalCredits);
}
