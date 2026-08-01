import { describe, it, expect } from "vitest";
import { Prisma, FeeStatus } from "@prisma/client";
import { deriveFeeStatus, sumPayments } from "@/lib/fee-status";

const d = (v: string) => new Prisma.Decimal(v);

describe("sumPayments", () => {
  it("returns zero for no payments", () => {
    expect(sumPayments([]).toString()).toBe("0");
  });

  it("adds decimals exactly", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floating point; must be "0.3" here.
    expect(sumPayments([d("0.1"), d("0.2")]).toString()).toBe("0.3");
  });

  it("sums a realistic instalment plan exactly", () => {
    expect(sumPayments([d("1500.50"), d("2000.25"), d("1499.25")]).toString()).toBe("5000");
  });
});

describe("deriveFeeStatus", () => {
  it("is UNPAID when nothing has been paid", () => {
    expect(deriveFeeStatus(d("5000"), d("0"))).toBe(FeeStatus.UNPAID);
  });

  it("is PARTIAL when some has been paid", () => {
    expect(deriveFeeStatus(d("5000"), d("1500.50"))).toBe(FeeStatus.PARTIAL);
  });

  it("is PAID on exact payoff", () => {
    expect(deriveFeeStatus(d("5000"), d("5000"))).toBe(FeeStatus.PAID);
  });

  it("is PAID on exact payoff reached in instalments", () => {
    const paid = sumPayments([d("1500.50"), d("2000.25"), d("1499.25")]);
    expect(deriveFeeStatus(d("5000"), paid)).toBe(FeeStatus.PAID);
  });

  it("is PAID on overpayment", () => {
    expect(deriveFeeStatus(d("5000"), d("5500"))).toBe(FeeStatus.PAID);
  });

  it("is PARTIAL one cent short", () => {
    expect(deriveFeeStatus(d("5000"), d("4999.99"))).toBe(FeeStatus.PARTIAL);
  });
});
