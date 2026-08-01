import { z } from "zod";

// ISO date strings ("2026-08-15") and 24-hour times ("09:30") compare
// lexicographically in the same order they compare chronologically, so the
// cross-field "after" rules can operate on the raw strings without parsing.
export const dateString = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`);

export const timeString = (label: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a valid time`);

export const positiveInt = (label: string) =>
  z.coerce
    .number()
    .int(`${label} must be a whole number`)
    .min(1, `${label} must be at least 1`);

// Money stays a string end to end. Routing an amount through
// z.coerce.number() sends it through a JS double, which silently rewrites
// "89.99" as 89.98999999999999 — a real corruption bug this project already
// hit once on GradeScale in Phase 2. Prisma accepts a string for a Decimal
// column directly, so validate the shape and pass it through untouched.
export const decimalString = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, `${label} must be a non-negative number`)
    .refine((v) => Number(v) > 0, `${label} must be greater than zero`);
