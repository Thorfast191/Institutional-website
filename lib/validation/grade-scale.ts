import { z } from "zod";

// Form fields arrive as strings and the columns are Prisma `Decimal`. Keep them
// as strings the whole way to Prisma so Postgres parses the exact value: routing
// a decimal through a JS number rounds it (89.99 becomes 89.98999999999999) and
// leaves gaps between adjacent grade bands.
const decimalField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, `${label} must be a non-negative number`);

export const gradeScaleSchema = z
  .object({
    minMarks: decimalField("Minimum marks"),
    maxMarks: decimalField("Maximum marks"),
    letterGrade: z.string().min(1, "Letter grade is required"),
    gradePoint: decimalField("Grade point").refine(
      (value) => Number(value) <= 4,
      "Grade point cannot exceed 4"
    ),
  })
  .refine((data) => Number(data.minMarks) < Number(data.maxMarks), {
    message: "Minimum marks must be less than maximum marks",
    path: ["minMarks"],
  });
