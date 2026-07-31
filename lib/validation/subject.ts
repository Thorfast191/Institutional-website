import { z } from "zod";
import { positiveInt } from "@/lib/validation/fields";

export const subjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  credits: positiveInt("Credits"),
  programId: z.string().min(1, "Program is required"),
});
