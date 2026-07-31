import { z } from "zod";

export const gradeScaleSchema = z
  .object({
    minMarks: z.coerce.number().min(0),
    maxMarks: z.coerce.number().min(0),
    letterGrade: z.string().min(1, "Letter grade is required"),
    gradePoint: z.coerce.number().min(0).max(4),
  })
  .refine((data) => data.minMarks < data.maxMarks, {
    message: "Minimum marks must be less than maximum marks",
    path: ["minMarks"],
  });
