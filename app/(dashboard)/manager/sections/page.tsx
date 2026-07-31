import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteSection } from "@/lib/actions/sections";
import { resolveTermFilter } from "@/lib/term-filter";

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; termId?: string }>;
}) {
  const { error, termId } = await searchParams;
  const activeTermId = await resolveTermFilter(termId);

  const [sections, terms] = await Promise.all([
    prisma.section.findMany({
      where: activeTermId ? { termId: activeTermId } : undefined,
      include: { subject: true, term: true, teacher: { include: { user: true } } },
      orderBy: [{ subject: { code: "asc" } }, { label: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Sections</h1>
        <Link
          href="/manager/sections/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Section
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/manager/sections?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/manager/sections?termId=all"
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
            <th className="px-4 py-2 font-medium">Label</th>
            <th className="px-4 py-2 font-medium">Term</th>
            <th className="px-4 py-2 font-medium">Teacher</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">
                {s.subject.code} — {s.subject.name}
              </td>
              <td className="px-4 py-2 text-slate-600">{s.label}</td>
              <td className="px-4 py-2 text-slate-600">{s.term.name}</td>
              <td className="px-4 py-2 text-slate-600">{s.teacher.user.name}</td>
              <td className="px-4 py-2">
                <Link href={`/manager/sections/${s.id}`} className="text-slate-600 underline">
                  Schedule
                </Link>
                <Link
                  href={`/manager/sections/${s.id}/edit`}
                  className="ml-3 text-slate-600 underline"
                >
                  Edit
                </Link>
                <form action={deleteSection.bind(null, s.id)} className="inline">
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
