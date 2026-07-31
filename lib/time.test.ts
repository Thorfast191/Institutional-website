import { describe, it, expect } from "vitest";
import { parseTimeInput, formatTimeInput, parseDateInput, formatDateInput } from "@/lib/time";

describe("parseTimeInput", () => {
  it("parses a time onto the 1970-01-01 UTC epoch date", () => {
    expect(parseTimeInput("09:30").toISOString()).toBe("1970-01-01T09:30:00.000Z");
  });

  it("handles midnight", () => {
    expect(parseTimeInput("00:00").toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("handles the last minute of the day", () => {
    expect(parseTimeInput("23:59").toISOString()).toBe("1970-01-01T23:59:00.000Z");
  });

  it("rejects a malformed time", () => {
    expect(() => parseTimeInput("9:30")).toThrow();
    expect(() => parseTimeInput("24:00")).toThrow();
    expect(() => parseTimeInput("")).toThrow();
  });
});

describe("formatTimeInput", () => {
  it("formats using UTC, not local time", () => {
    expect(formatTimeInput(new Date("1970-01-01T09:30:00Z"))).toBe("09:30");
  });

  it("zero-pads", () => {
    expect(formatTimeInput(new Date("1970-01-01T07:05:00Z"))).toBe("07:05");
  });

  it("round-trips with parseTimeInput", () => {
    for (const value of ["00:00", "07:05", "09:30", "12:00", "23:59"]) {
      expect(formatTimeInput(parseTimeInput(value))).toBe(value);
    }
  });
});

describe("parseDateInput", () => {
  it("parses to UTC midnight", () => {
    expect(parseDateInput("2026-08-15").toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("rejects a malformed date", () => {
    expect(() => parseDateInput("2026-8-15")).toThrow();
    expect(() => parseDateInput("")).toThrow();
  });
});

describe("formatDateInput", () => {
  it("formats using UTC, not local time", () => {
    expect(formatDateInput(new Date("2026-08-15T00:00:00Z"))).toBe("2026-08-15");
  });

  it("round-trips with parseDateInput", () => {
    for (const value of ["2026-01-01", "2026-08-15", "2026-12-31"]) {
      expect(formatDateInput(parseDateInput(value))).toBe(value);
    }
  });
});
