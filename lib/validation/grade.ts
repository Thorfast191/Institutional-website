import { z } from "zod";

export const gradeSchema = z.object({
  enrollmentId: z.string().min(1, "Enrollment is required"),
  // Marks stay a string for the same reason money does: Prisma stores the
  // Decimal exactly, and a JS double would not. Unlike money, zero is valid,
  // so this does not reuse decimalString.
  marks: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Marks must be a number between 0 and 100")
    .refine((v) => Number(v) <= 100, "Marks cannot exceed 100"),
});
