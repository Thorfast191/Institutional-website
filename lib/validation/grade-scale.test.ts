import { describe, it, expect } from "vitest";
import { gradeScaleSchema } from "@/lib/validation/grade-scale";

describe("gradeScaleSchema", () => {
  it("accepts a valid band", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "90",
      maxMarks: "100",
      letterGrade: "A+",
      gradePoint: "4.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects minMarks >= maxMarks", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "90",
      maxMarks: "80",
      letterGrade: "A+",
      gradePoint: "4.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing letterGrade", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "80",
      maxMarks: "90",
      letterGrade: "",
      gradePoint: "3.5",
    });
    expect(result.success).toBe(false);
  });

  it("preserves the exact decimal instead of routing it through a JS float", () => {
    // 89.99 as a JS double is 89.98999999999999..., which Postgres then stores
    // verbatim in the Decimal column and leaves a gap between grade bands.
    const result = gradeScaleSchema.safeParse({
      minMarks: "85",
      maxMarks: "89.99",
      letterGrade: "A",
      gradePoint: "3.75",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxMarks).toBe("89.99");
      expect(result.data.gradePoint).toBe("3.75");
    }
  });

  it("rejects a non-numeric value", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "abc",
      maxMarks: "90",
      letterGrade: "A",
      gradePoint: "3.75",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a grade point above 4", () => {
    const result = gradeScaleSchema.safeParse({
      minMarks: "85",
      maxMarks: "90",
      letterGrade: "A",
      gradePoint: "4.5",
    });
    expect(result.success).toBe(false);
  });
});
