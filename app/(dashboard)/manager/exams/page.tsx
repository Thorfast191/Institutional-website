import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteExam } from "@/lib/actions/exams";
import { resolveTermFilter } from "@/lib/term-filter";
import { formatDateInput, formatTimeInput } from "@/lib/time";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; termId?: string }>;
}) {
  const { error, termId } = await searchParams;
  const activeTermId = await resolveTermFilter(termId);

  const [exams, terms] = await Promise.all([
    prisma.exam.findMany({
      where: activeTermId ? { termId: activeTermId } : undefined,
      include: { subject: true, term: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Exams</h1>
        <Link
          href="/manager/exams/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Exam
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/manager/exams?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/manager/exams?termId=all"
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
            <th className="px-4 py-2 font-medium">Subject</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">Room</th>
            <th className="px-4 py-2 font-medium">Term</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {exams.map((e) => (
            <tr key={e.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{e.subject.code}</td>
              <td className="px-4 py-2 text-slate-600">
                {e.examType} {e.sequence > 1 ? e.sequence : ""}
              </td>
              <td className="px-4 py-2 text-slate-600">{formatDateInput(e.date)}</td>
              <td className="px-4 py-2 text-slate-600">
                {formatTimeInput(e.startTime)} – {formatTimeInput(e.endTime)}
              </td>
              <td className="px-4 py-2 text-slate-600">{e.room}</td>
              <td className="px-4 py-2 text-slate-600">{e.term.name}</td>
              <td className="px-4 py-2">
                <Link href={`/manager/exams/${e.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteExam.bind(null, e.id)} className="inline">
                  <button type="submit" className="ml-3 text-red-600 underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
