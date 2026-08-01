import { describe, it, expect } from "vitest";
import { gradeSchema } from "@/lib/validation/grade";

const valid = { enrollmentId: "enr-1", marks: "87.5" };

describe("gradeSchema", () => {
  it("accepts valid marks", () => {
    expect(gradeSchema.safeParse(valid).success).toBe(true);
  });

  it("keeps marks as an exact string", () => {
    const result = gradeSchema.safeParse({ ...valid, marks: "89.99" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.marks).toBe("89.99");
  });

  it("accepts zero marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "0" }).success).toBe(true);
  });

  it("accepts full marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "100" }).success).toBe(true);
  });

  it("rejects marks above 100", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "101" }).success).toBe(false);
  });

  it("rejects negative marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "-1" }).success).toBe(false);
  });

  it("rejects non-numeric marks", () => {
    expect(gradeSchema.safeParse({ ...valid, marks: "abc" }).success).toBe(false);
  });

  it("rejects a missing enrollmentId", () => {
    expect(gradeSchema.safeParse({ ...valid, enrollmentId: "" }).success).toBe(false);
  });
});
