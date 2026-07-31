import { z } from "zod";
import { dateString } from "@/lib/validation/fields";

export const termSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    startDate: dateString("Start date"),
    endDate: dateString("End date"),
    registrationOpensAt: dateString("Registration opening date"),
    registrationClosesAt: dateString("Registration closing date"),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  })
  .refine((data) => data.registrationClosesAt > data.registrationOpensAt, {
    message: "Registration must close after it opens",
    path: ["registrationClosesAt"],
  });
