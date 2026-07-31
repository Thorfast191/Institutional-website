import { describe, it, expect } from "vitest";
import { departmentSchema } from "@/lib/validation/department";

describe("departmentSchema", () => {
  it("accepts a valid department", () => {
    const result = departmentSchema.safeParse({ name: "Computer Science", code: "CS" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = departmentSchema.safeParse({ name: "", code: "CS" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty code", () => {
    const result = departmentSchema.safeParse({ name: "Computer Science", code: "" });
    expect(result.success).toBe(false);
  });
});
