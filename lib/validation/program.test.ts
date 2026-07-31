import { describe, it, expect } from "vitest";
import { programSchema } from "@/lib/validation/program";

describe("programSchema", () => {
  it("accepts a valid program", () => {
    const result = programSchema.safeParse({
      name: "BSc in Computer Science",
      code: "BSC-CSE",
      departmentId: "dept-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing departmentId", () => {
    const result = programSchema.safeParse({ name: "BSc in CS", code: "BSC-CSE", departmentId: "" });
    expect(result.success).toBe(false);
  });
});
