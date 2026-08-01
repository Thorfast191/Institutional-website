import { z } from "zod";
import { ExamType } from "@prisma/client";
import { dateString, timeString, positiveInt } from "@/lib/validation/fields";

export const examSchema = z
  .object({
    subjectId: z.string().min(1, "Subject is required"),
    termId: z.string().min(1, "Term is required"),
    examType: z.nativeEnum(ExamType, { message: "Exam type is required" }),
    sequence: positiveInt("Sequence"),
    date: dateString("Date"),
    startTime: timeString("Start time"),
    endTime: timeString("End time"),
    room: z.string().min(1, "Room is required"),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });
