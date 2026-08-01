import { Prisma } from "@prisma/client";

export type GradeBand = {
  minMarks: Prisma.Decimal;
  maxMarks: Prisma.Decimal;
  letterGrade: string;
  gradePoint: Prisma.Decimal;
};

// Bounds are inclusive on both ends, and the comparison uses Decimal rather
// than JS numbers: a band ending at 89.99 must match a mark of exactly 89.99,
// which float arithmetic cannot guarantee.
export function findGradeBand<T extends GradeBand>(
  marks: Prisma.Decimal,
  bands: T[]
): T | null {
  return (
    bands.find(
      (b) => marks.comparedTo(b.minMarks) >= 0 && marks.comparedTo(b.maxMarks) <= 0
    ) ?? null
  );
}
