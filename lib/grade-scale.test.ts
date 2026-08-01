import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { findGradeBand } from "@/lib/grade-scale";

const d = (v: string) => new Prisma.Decimal(v);
const band = (min: string, max: string, letter: string, point: string) => ({
  minMarks: d(min),
  maxMarks: d(max),
  letterGrade: letter,
  gradePoint: d(point),
});

// Mirrors the seeded scale: contiguous bands with .99 upper bounds.
const bands = [
  band("90", "100", "A+", "4"),
  band("85", "89.99", "A", "3.75"),
  band("80", "84.99", "A-", "3.5"),
  band("0", "39.99", "F", "0"),
];

describe("findGradeBand", () => {
  it("finds the band containing the marks", () => {
    expect(findGradeBand(d("87"), bands)?.letterGrade).toBe("A");
  });

  it("matches a mark exactly on the lower bound", () => {
    expect(findGradeBand(d("85"), bands)?.letterGrade).toBe("A");
  });

  it("matches a mark exactly on the upper bound", () => {
    // The case Phase 2's Decimal corruption would have broken: a band ending
    // at 89.98999999999999 matches nothing at 89.99.
    expect(findGradeBand(d("89.99"), bands)?.letterGrade).toBe("A");
  });

  it("matches the top of the top band", () => {
    expect(findGradeBand(d("100"), bands)?.letterGrade).toBe("A+");
  });

  it("matches zero", () => {
    expect(findGradeBand(d("0"), bands)?.letterGrade).toBe("F");
  });

  it("returns null when no band matches", () => {
    // 40–79.99 is deliberately absent from this fixture.
    expect(findGradeBand(d("50"), bands)).toBeNull();
  });
});
