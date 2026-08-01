import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordPayment } from "@/lib/actions/fees";
import { formatDateInput } from "@/lib/time";
import { sumPayments } from "@/lib/fee-status";

const METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.BANK,
  PaymentMethod.ONLINE,
  PaymentMethod.OTHER,
];

export default async function FeeItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const feeItem = await prisma.feeItem.findUnique({
    where: { id },
    include: {
      student: { include: { user: true } },
      term: true,
      payments: {
        include: { recordedByUser: true },
        orderBy: { paidAt: "asc" },
      },
    },
  });
  if (!feeItem) notFound();

  const paid = sumPayments(feeItem.payments.map((p) => p.amount));
  const outstanding = feeItem.amount.minus(paid);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/manager/fees" className="text-sm text-slate-500 underline">
          ← Back to fees
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {feeItem.feeType} — {feeItem.student.user.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {feeItem.term.name} · due {formatDateInput(feeItem.dueDate)} · {feeItem.status}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Amount</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{feeItem.amount.toString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Paid</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{paid.toString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Outstanding</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {outstanding.comparedTo(0) > 0 ? outstanding.toString() : "0"}
          </p>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-medium text-slate-900">Payment History</h2>
      {feeItem.payments.length === 0 ? (
        <p className="mb-6 text-sm text-slate-500">No payments recorded yet.</p>
      ) : (
        <table className="mb-6 w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Method</th>
              <th className="px-4 py-2 font-medium">Reference</th>
              <th className="px-4 py-2 font-medium">Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {feeItem.payments.map((p) => (
              <tr key={p.id} className="border-t border-slate-200">
                <td className="px-4 py-2 text-slate-600">{formatDateInput(p.paidAt)}</td>
                <td className="px-4 py-2 text-slate-900">{p.amount.toString()}</td>
                <td className="px-4 py-2 text-slate-600">{p.method}</td>
                <td className="px-4 py-2 text-slate-600">{p.reference ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{p.recordedByUser.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-3 text-lg font-medium text-slate-900">Record a Payment</h2>
      <form
        action={recordPayment.bind(null, feeItem.id)}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="method"
          defaultValue={PaymentMethod.CASH}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          name="reference"
          placeholder="Reference (optional)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="paidAt"
          type="date"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Record
        </button>
      </form>
    </div>
  );
}
