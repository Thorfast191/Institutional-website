import { Prisma, FeeStatus } from "@prisma/client";

// Prisma.Decimal is decimal.js — .plus() and .comparedTo() are exact, unlike
// the JS number arithmetic that would leave a three-instalment payoff sitting
// at PARTIAL with a 0.0000000001 remainder.
export function sumPayments(amounts: Prisma.Decimal[]): Prisma.Decimal {
  return amounts.reduce((total, a) => total.plus(a), new Prisma.Decimal(0));
}

export function deriveFeeStatus(amount: Prisma.Decimal, paid: Prisma.Decimal): FeeStatus {
  if (paid.comparedTo(0) <= 0) return FeeStatus.UNPAID;
  if (paid.comparedTo(amount) >= 0) return FeeStatus.PAID;
  return FeeStatus.PARTIAL;
}
