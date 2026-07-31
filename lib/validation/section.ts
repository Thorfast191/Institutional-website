import { z } from "zod";

export const sectionSchema = z.object({
  subjectId: z.string().min(1, "Subject is required"),
  termId: z.string().min(1, "Term is required"),
  teacherId: z.string().min(1, "Teacher is required"),
  label: z.string().min(1, "Label is required"),
});
