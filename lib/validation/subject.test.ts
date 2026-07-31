import { describe, it, expect } from "vitest";
import { subjectSchema } from "@/lib/validation/subject";

const valid = { name: "Structured Programming", code: "CSE101", credits: "3", programId: "prog-1" };

describe("subjectSchema", () => {
  it("accepts a valid subject", () => {
    expect(subjectSchema.safeParse(valid).success).toBe(true);
  });

  it("coerces credits from the form string to a number", () => {
    const result = subjectSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.credits).toBe(3);
  });

  it("rejects an empty name", () => {
    expect(subjectSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects an empty code", () => {
    expect(subjectSchema.safeParse({ ...valid, code: "" }).success).toBe(false);
  });

  it("rejects a missing programId", () => {
    expect(subjectSchema.safeParse({ ...valid, programId: "" }).success).toBe(false);
  });

  it("rejects zero or fractional credits", () => {
    expect(subjectSchema.safeParse({ ...valid, credits: "0" }).success).toBe(false);
    expect(subjectSchema.safeParse({ ...valid, credits: "1.5" }).success).toBe(false);
  });
});
