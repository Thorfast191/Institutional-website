import { z } from "zod";

const baseFields = {
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
};

const teacherFields = {
  employeeId: z.string().min(1, "Employee ID is required"),
  departmentId: z.string().min(1, "Department is required"),
  designation: z.string().min(1, "Designation is required"),
};

const studentFields = {
  studentId: z.string().min(1, "Student ID is required"),
  programId: z.string().min(1, "Program is required"),
};

const password = z.string().min(8, "Password must be at least 8 characters");

export const createUserSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("ADMIN"), ...baseFields, password }),
  z.object({ role: z.literal("MANAGER"), ...baseFields, password }),
  z.object({ role: z.literal("TEACHER"), ...baseFields, password, ...teacherFields }),
  z.object({ role: z.literal("STUDENT"), ...baseFields, password, ...studentFields }),
]);

export const editUserSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("ADMIN"), ...baseFields }),
  z.object({ role: z.literal("MANAGER"), ...baseFields }),
  z.object({ role: z.literal("TEACHER"), ...baseFields, ...teacherFields }),
  z.object({ role: z.literal("STUDENT"), ...baseFields, ...studentFields }),
]);

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
