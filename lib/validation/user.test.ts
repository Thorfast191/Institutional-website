import { describe, it, expect } from "vitest";
import { createUserSchema, editUserSchema, resetPasswordSchema } from "@/lib/validation/user";

describe("createUserSchema", () => {
  it("accepts a valid ADMIN user", () => {
    const result = createUserSchema.safeParse({
      role: "ADMIN",
      name: "Ayesha Rahman",
      email: "admin2@school.edu",
      password: "Passw0rd!",
    });
    expect(result.success).toBe(true);
  });

  it("requires employeeId/departmentId/designation for TEACHER", () => {
    const result = createUserSchema.safeParse({
      role: "TEACHER",
      name: "Dr. Test",
      email: "test.teacher@school.edu",
      password: "Passw0rd!",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid TEACHER user", () => {
    const result = createUserSchema.safeParse({
      role: "TEACHER",
      name: "Dr. Test",
      email: "test.teacher@school.edu",
      password: "Passw0rd!",
      employeeId: "EMP-099",
      departmentId: "dept-1",
      designation: "Lecturer",
    });
    expect(result.success).toBe(true);
  });

  it("requires studentId/programId for STUDENT", () => {
    const result = createUserSchema.safeParse({
      role: "STUDENT",
      name: "Test Student",
      email: "test.student@school.edu",
      password: "Passw0rd!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = createUserSchema.safeParse({
      role: "ADMIN",
      name: "Ayesha Rahman",
      email: "admin2@school.edu",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("editUserSchema", () => {
  it("accepts a valid STUDENT edit without a password field", () => {
    const result = editUserSchema.safeParse({
      role: "STUDENT",
      name: "Test Student",
      email: "test.student@school.edu",
      studentId: "STU-9999",
      programId: "prog-1",
    });
    expect(result.success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects a short password", () => {
    expect(resetPasswordSchema.safeParse({ password: "short" }).success).toBe(false);
  });

  it("accepts an 8+ character password", () => {
    expect(resetPasswordSchema.safeParse({ password: "NewPassw0rd!" }).success).toBe(true);
  });
});
