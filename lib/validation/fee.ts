import { z } from "zod";
import { FeeType, PaymentMethod } from "@prisma/client";
import { dateString, decimalString } from "@/lib/validation/fields";

export const feeItemSchema = z.object({
  studentId: z.string().min(1, "Student is required"),
  termId: z.string().min(1, "Term is required"),
  feeType: z.nativeEnum(FeeType, { message: "Fee type is required" }),
  amount: decimalString("Amount"),
  dueDate: dateString("Due date"),
});

// An empty reference field means "no reference", not an invalid one — cash
// payments routinely have none.
export const paymentSchema = z.object({
  amount: decimalString("Amount"),
  method: z.nativeEnum(PaymentMethod, { message: "Payment method is required" }),
  reference: z.string().optional(),
  paidAt: dateString("Payment date"),
});
