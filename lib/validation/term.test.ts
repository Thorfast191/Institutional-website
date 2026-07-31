import { describe, it, expect } from "vitest";
import { termSchema } from "@/lib/validation/term";

const valid = {
  name: "Fall 2026",
  startDate: "2026-09-01",
  endDate: "2026-12-20",
  registrationOpensAt: "2026-08-01",
  registrationClosesAt: "2026-08-25",
};

describe("termSchema", () => {
  it("accepts a valid term", () => {
    expect(termSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(termSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = termSchema.safeParse({ ...valid, endDate: "2026-08-01" });
    expect(result.success).toBe(false);
  });

  it("rejects an end date equal to the start date", () => {
    const result = termSchema.safeParse({ ...valid, endDate: valid.startDate });
    expect(result.success).toBe(false);
  });

  it("rejects a registration window that closes before it opens", () => {
    const result = termSchema.safeParse({ ...valid, registrationClosesAt: "2026-07-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(termSchema.safeParse({ ...valid, startDate: "2026-9-1" }).success).toBe(false);
  });

  it("allows a registration window outside the term dates", () => {
    // Registration opening months before the term starts is normal and stays unconstrained.
    const result = termSchema.safeParse({ ...valid, registrationOpensAt: "2026-01-01" });
    expect(result.success).toBe(true);
  });
});
