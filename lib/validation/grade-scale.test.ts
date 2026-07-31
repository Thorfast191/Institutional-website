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
});
