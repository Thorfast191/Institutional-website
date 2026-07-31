import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSection } from "@/lib/actions/sections";

export default async function EditSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [section, subjects, terms, teachers] = await Promise.all([
    prisma.section.findUnique({ where: { id } }),
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
    prisma.teacherProfile.findMany({ include: { user: true }, orderBy: { employeeId: "asc" } }),
  ]);
  if (!section) notFound();

  const updateWithId = updateSection.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Section</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="subjectId">
          Subject
        </label>
        <select
          id="subjectId"
          name="subjectId"
          defaultValue={section.subjectId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="termId">
          Term
        </label>
        <select
          id="termId"
          name="termId"
          defaultValue={section.termId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="teacherId">
          Teacher
        </label>
        <select
          id="teacherId"
          name="teacherId"
          defaultValue={section.teacherId}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.user.name} ({t.employeeId})
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="label">
          Label
        </label>
        <input
          id="label"
          name="label"
          defaultValue={section.label}
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </form>
    </div>
  );
}
