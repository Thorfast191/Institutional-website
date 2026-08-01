import { FeeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createFeeItem } from "@/lib/actions/fees";

const FEE_TYPES: FeeType[] = [
  FeeType.TUITION,
  FeeType.LAB,
  FeeType.LIBRARY,
  FeeType.EXAM,
  FeeType.OTHER,
];

export default async function NewFeeItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [students, terms] = await Promise.all([
    prisma.studentProfile.findMany({
      include: { user: true },
      orderBy: { studentId: "asc" },
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Fee Item</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createFeeItem} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="studentId">
          Student
        </label>
        <select
          id="studentId"
          name="studentId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.user.name} ({s.studentId})
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="termId">
          Term
        </label>
        <select
          id="termId"
          name="termId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="feeType">
          Fee Type
        </label>
        <select
          id="feeType"
          name="feeType"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {FEE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="amount">
          Amount
        </label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="5000.00"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="dueDate">
          Due Date
        </label>
        <input
          id="dueDate"
          name="dueDate"
          type="date"
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create
        </button>
      </form>
    </div>
  );
}
