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
