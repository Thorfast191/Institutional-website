"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { feeItemSchema, paymentSchema } from "@/lib/validation/fee";
import { parseDateInput } from "@/lib/time";
import { deriveFeeStatus, sumPayments } from "@/lib/fee-status";

export async function createFeeItem(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = feeItemSchema.safeParse({
    studentId: formData.get("studentId"),
    termId: formData.get("termId"),
    feeType: formData.get("feeType"),
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) {
    redirect(`/manager/fees/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const data = parsed.data;
  // amount stays the validated string — Prisma accepts it for a Decimal column
  // and stores it exactly. Never Number(data.amount) here.
  await prisma.feeItem.create({
    data: {
      studentId: data.studentId,
      termId: data.termId,
      feeType: data.feeType,
      amount: data.amount,
      dueDate: parseDateInput(data.dueDate),
    },
  });

  redirect("/manager/fees");
}

export async function recordPayment(feeItemId: string, formData: FormData) {
  const session = await requireRole(["MANAGER"]);

  const parsed = paymentSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference"),
    paidAt: formData.get("paidAt"),
  });
  if (!parsed.success) {
    redirect(
      `/manager/fees/${feeItemId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const feeItem = await prisma.feeItem.findUnique({
    where: { id: feeItemId },
    select: { amount: true },
  });
  if (!feeItem) {
    redirect(`/manager/fees?error=${encodeURIComponent("That fee item no longer exists.")}`);
  }

  const data = parsed.data;

  // The insert and the derived-status update are one transaction: a crash
  // between them would leave a recorded payment against a stale status.
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        feeItemId,
        amount: data.amount,
        method: data.method,
        reference: data.reference && data.reference.length > 0 ? data.reference : null,
        paidAt: parseDateInput(data.paidAt),
        recordedBy: session.user.id,
      },
    });

    const payments = await tx.payment.findMany({
      where: { feeItemId },
      select: { amount: true },
    });

    await tx.feeItem.update({
      where: { id: feeItemId },
      data: { status: deriveFeeStatus(feeItem.amount, sumPayments(payments.map((p) => p.amount))) },
    });
  });

  redirect(`/manager/fees/${feeItemId}`);
}
