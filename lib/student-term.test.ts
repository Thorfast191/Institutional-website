import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { isRegistrationOpen, calculateGpa } from "@/lib/student-term";

const d = (v: string) => new Prisma.Decimal(v);
const window = {
  registrationOpensAt: new Date("2026-07-01T00:00:00Z"),
  registrationClosesAt: new Date("2026-08-15T00:00:00Z"),
};

describe("isRegistrationOpen", () => {
  it("is open inside the window", () => {
    expect(isRegistrationOpen(window, new Date("2026-07-20T12:00:00Z"))).toBe(true);
  });

  it("is closed before it opens", () => {
    expect(isRegistrationOpen(window, new Date("2026-06-30T23:59:59Z"))).toBe(false);
  });

  it("is closed after it closes", () => {
    expect(isRegistrationOpen(window, new Date("2026-08-15T00:00:01Z"))).toBe(false);
  });

  it("is open on the exact opening instant", () => {
    expect(isRegistrationOpen(window, window.registrationOpensAt)).toBe(true);
  });

  it("is open on the exact closing instant", () => {
    expect(isRegistrationOpen(window, window.registrationClosesAt)).toBe(true);
  });

  it("is closed when there is no active term", () => {
    expect(isRegistrationOpen(null, new Date("2026-07-20T12:00:00Z"))).toBe(false);
  });
});

describe("calculateGpa", () => {
  it("returns null with no graded courses", () => {
    expect(calculateGpa([])).toBeNull();
  });

  it("returns the grade point of a single course", () => {
    expect(calculateGpa([{ gradePoint: d("3.75"), credits: 3 }])?.toFixed(2)).toBe("3.75");
  });

  it("weights by credits, not a plain mean", () => {
    // Plain mean would be 3.00; credit-weighted is (4*3 + 2*9) / 12 = 2.50.
    const gpa = calculateGpa([
      { gradePoint: d("4"), credits: 3 },
      { gradePoint: d("2"), credits: 9 },
    ]);
    expect(gpa?.toFixed(2)).toBe("2.50");
  });

  it("computes an exact repeating average without float drift", () => {
    const gpa = calculateGpa([
      { gradePoint: d("3.75"), credits: 3 },
      { gradePoint: d("3.5"), credits: 3 },
      { gradePoint: d("4"), credits: 3 },
    ]);
    expect(gpa?.toFixed(2)).toBe("3.75");
  });
});
