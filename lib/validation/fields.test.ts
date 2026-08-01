import { describe, it, expect } from "vitest";
import { decimalString } from "@/lib/validation/fields";

const amount = decimalString("Amount");

describe("decimalString", () => {
  it("accepts a plain integer string", () => {
    expect(amount.safeParse("5000").success).toBe(true);
  });

  it("accepts two decimal places", () => {
    expect(amount.safeParse("5000.50").success).toBe(true);
  });

  it("preserves the exact string rather than converting to a number", () => {
    const result = amount.safeParse("89.99");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("89.99");
  });

  it("rejects zero", () => {
    expect(amount.safeParse("0").success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(amount.safeParse("-10").success).toBe(false);
  });

  it("rejects non-numeric text", () => {
    expect(amount.safeParse("abc").success).toBe(false);
    expect(amount.safeParse("").success).toBe(false);
  });
});
