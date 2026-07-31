import { z } from "zod";
import { DayOfWeek } from "@prisma/client";
import { timeString } from "@/lib/validation/fields";

export const routineSchema = z
  .object({
    sectionId: z.string().min(1, "Section is required"),
    dayOfWeek: z.nativeEnum(DayOfWeek, { message: "Day of week is required" }),
    startTime: timeString("Start time"),
    endTime: timeString("End time"),
    room: z.string().min(1, "Room is required"),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });
