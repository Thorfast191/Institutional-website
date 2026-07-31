import { describe, it, expect } from "vitest";
import { routineSchema } from "@/lib/validation/routine";

const valid = {
  sectionId: "sec-1",
  dayOfWeek: "MONDAY",
  startTime: "09:00",
  endTime: "10:20",
  room: "Room 301",
};

describe("routineSchema", () => {
  it("accepts a valid routine slot", () => {
    expect(routineSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing sectionId", () => {
    expect(routineSchema.safeParse({ ...valid, sectionId: "" }).success).toBe(false);
  });

  it("rejects a day outside the DayOfWeek enum", () => {
    expect(routineSchema.safeParse({ ...valid, dayOfWeek: "FUNDAY" }).success).toBe(false);
  });

  it("rejects an end time before the start time", () => {
    expect(routineSchema.safeParse({ ...valid, endTime: "08:00" }).success).toBe(false);
  });

  it("rejects an end time equal to the start time", () => {
    expect(routineSchema.safeParse({ ...valid, endTime: valid.startTime }).success).toBe(false);
  });

  it("rejects a malformed time", () => {
    expect(routineSchema.safeParse({ ...valid, startTime: "9:00" }).success).toBe(false);
  });

  it("rejects an empty room", () => {
    expect(routineSchema.safeParse({ ...valid, room: "" }).success).toBe(false);
  });
});
