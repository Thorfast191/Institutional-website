import { describe, it, expect } from "vitest";
import { sectionSchema } from "@/lib/validation/section";

const valid = { subjectId: "sub-1", termId: "term-1", teacherId: "teach-1", label: "A" };

describe("sectionSchema", () => {
  it("accepts a valid section", () => {
    expect(sectionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing subjectId", () => {
    expect(sectionSchema.safeParse({ ...valid, subjectId: "" }).success).toBe(false);
  });

  it("rejects a missing termId", () => {
    expect(sectionSchema.safeParse({ ...valid, termId: "" }).success).toBe(false);
  });

  it("rejects a missing teacherId", () => {
    expect(sectionSchema.safeParse({ ...valid, teacherId: "" }).success).toBe(false);
  });

  it("rejects an empty label", () => {
    expect(sectionSchema.safeParse({ ...valid, label: "" }).success).toBe(false);
  });
});
