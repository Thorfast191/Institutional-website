import { z } from "zod";

export const programSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  departmentId: z.string().min(1, "Department is required"),
});
