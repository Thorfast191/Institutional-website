import { describe, it, expect } from "vitest";
import { examSchema } from "@/lib/validation/exam";

const valid = {
  subjectId: "sub-1",
  termId: "term-1",
  examType: "MIDTERM",
  sequence: "1",
  date: "2026-10-12",
  startTime: "10:00",
  endTime: "12:00",
  room: "Hall A",
};

describe("examSchema", () => {
  it("accepts a valid exam", () => {
    expect(examSchema.safeParse(valid).success).toBe(true);
  });

  it("coerces sequence from the form string to a number", () => {
    const result = examSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sequence).toBe(1);
  });

  it("rejects an examType outside the enum", () => {
    expect(examSchema.safeParse({ ...valid, examType: "POPQUIZ" }).success).toBe(false);
  });

  it("rejects an end time before the start time", () => {
    expect(examSchema.safeParse({ ...valid, endTime: "09:00" }).success).toBe(false);
  });

  it("rejects a sequence below 1", () => {
    expect(examSchema.safeParse({ ...valid, sequence: "0" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(examSchema.safeParse({ ...valid, date: "2026-10-2" }).success).toBe(false);
  });

  it("rejects an empty room", () => {
    expect(examSchema.safeParse({ ...valid, room: "" }).success).toBe(false);
  });
});
