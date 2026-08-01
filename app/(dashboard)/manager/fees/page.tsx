import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveTermFilter } from "@/lib/term-filter";
import { formatDateInput } from "@/lib/time";
import { sumPayments } from "@/lib/fee-status";

const STATUS_CLASS: Record<string, string> = {
  PAID: "text-green-700",
  PARTIAL: "text-amber-700",
  UNPAID: "text-red-700",
};

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; termId?: string }>;
}) {
  const { error, termId } = await searchParams;
  const activeTermId = await resolveTermFilter(termId);

  const [feeItems, terms] = await Promise.all([
    prisma.feeItem.findMany({
      where: activeTermId ? { termId: activeTermId } : undefined,
      include: {
        student: { include: { user: true } },
        term: true,
        payments: { select: { amount: true } },
      },
      orderBy: [{ dueDate: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Fees</h1>
        <Link
          href="/manager/fees/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Fee Item
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/manager/fees?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/manager/fees?termId=all"
          className={!activeTermId ? "font-medium text-slate-900" : "text-slate-500"}
        >
          All terms
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Student</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Paid</th>
            <th className="px-4 py-2 font-medium">Due</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {feeItems.map((f) => {
            const paid = sumPayments(f.payments.map((p) => p.amount));
            return (
              <tr key={f.id} className="border-t border-slate-200">
                <td className="px-4 py-2 text-slate-900">
                  {f.student.user.name} ({f.student.studentId})
                </td>
                <td className="px-4 py-2 text-slate-600">{f.feeType}</td>
                <td className="px-4 py-2 text-slate-600">{f.amount.toString()}</td>
                <td className="px-4 py-2 text-slate-600">{paid.toString()}</td>
                <td className="px-4 py-2 text-slate-600">{formatDateInput(f.dueDate)}</td>
                <td className={`px-4 py-2 font-medium ${STATUS_CLASS[f.status] ?? ""}`}>
                  {f.status}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/manager/fees/${f.id}`} className="text-slate-600 underline">
                    Payments
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
