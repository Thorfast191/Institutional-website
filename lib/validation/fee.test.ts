import { describe, it, expect } from "vitest";
import { feeItemSchema, paymentSchema } from "@/lib/validation/fee";

const validFee = {
  studentId: "stu-1",
  termId: "term-1",
  feeType: "TUITION",
  amount: "5000.00",
  dueDate: "2026-09-15",
};

const validPayment = {
  amount: "1500.50",
  method: "BANK",
  reference: "TXN-9001",
  paidAt: "2026-08-20",
};

describe("feeItemSchema", () => {
  it("accepts a valid fee item", () => {
    expect(feeItemSchema.safeParse(validFee).success).toBe(true);
  });

  it("keeps the amount as an exact string", () => {
    const result = feeItemSchema.safeParse({ ...validFee, amount: "89.99" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe("89.99");
  });

  it("rejects a feeType outside the enum", () => {
    expect(feeItemSchema.safeParse({ ...validFee, feeType: "PARKING" }).success).toBe(false);
  });

  it("rejects a zero amount", () => {
    expect(feeItemSchema.safeParse({ ...validFee, amount: "0" }).success).toBe(false);
  });

  it("rejects a missing studentId", () => {
    expect(feeItemSchema.safeParse({ ...validFee, studentId: "" }).success).toBe(false);
  });

  it("rejects a malformed due date", () => {
    expect(feeItemSchema.safeParse({ ...validFee, dueDate: "2026-9-15" }).success).toBe(false);
  });
});

describe("paymentSchema", () => {
  it("accepts a valid payment", () => {
    expect(paymentSchema.safeParse(validPayment).success).toBe(true);
  });

  it("accepts a payment with no reference", () => {
    const result = paymentSchema.safeParse({ ...validPayment, reference: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a method outside the enum", () => {
    expect(paymentSchema.safeParse({ ...validPayment, method: "BARTER" }).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(paymentSchema.safeParse({ ...validPayment, amount: "-5" }).success).toBe(false);
  });
});
