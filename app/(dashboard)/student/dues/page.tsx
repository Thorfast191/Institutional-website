import { prisma } from "@/lib/prisma";
import { requireStudentProfile } from "@/lib/student-access";
import { sumPayments } from "@/lib/fee-status";
import { formatDateInput } from "@/lib/time";

const STATUS_CLASS: Record<string, string> = {
  PAID: "text-green-700",
  PARTIAL: "text-amber-700",
  UNPAID: "text-red-700",
};

export default async function StudentDuesPage() {
  const { profile } = await requireStudentProfile();

  const feeItems = await prisma.feeItem.findMany({
    where: { studentId: profile.id },
    include: { term: true, payments: { select: { amount: true } } },
    orderBy: { dueDate: "asc" },
  });

  const totalOutstanding = feeItems.reduce((total, f) => {
    const paid = sumPayments(f.payments.map((p) => p.amount));
    const remaining = f.amount.minus(paid);
    return remaining.comparedTo(0) > 0 ? total.plus(remaining) : total;
  }, sumPayments([]));

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Dues</h1>
      <p className="mb-6 text-sm text-slate-600">
        Total outstanding:{" "}
        <span className="font-medium text-slate-900">{totalOutstanding.toString()}</span>
      </p>

      {feeItems.length === 0 ? (
        <p className="text-sm text-slate-500">No fees have been raised for you.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Paid</th>
              <th className="px-4 py-2 font-medium">Outstanding</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {feeItems.map((f) => {
              const paid = sumPayments(f.payments.map((p) => p.amount));
              const remaining = f.amount.minus(paid);
              return (
                <tr key={f.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 text-slate-900">{f.feeType}</td>
                  <td className="px-4 py-2 text-slate-600">{f.term.name}</td>
                  <td className="px-4 py-2 text-slate-600">{f.amount.toString()}</td>
                  <td className="px-4 py-2 text-slate-600">{paid.toString()}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {remaining.comparedTo(0) > 0 ? remaining.toString() : "0"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{formatDateInput(f.dueDate)}</td>
                  <td className={`px-4 py-2 font-medium ${STATUS_CLASS[f.status] ?? ""}`}>
                    {f.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
