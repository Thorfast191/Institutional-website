import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTeacherProfile } from "@/lib/teacher-access";
import { resolveTermFilter } from "@/lib/term-filter";

export default async function TeacherDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string }>;
}) {
  const { termId } = await searchParams;
  const { teacherId } = await requireTeacherProfile();
  const activeTermId = await resolveTermFilter(termId);

  const [sections, terms] = await Promise.all([
    prisma.section.findMany({
      where: { teacherId, ...(activeTermId ? { termId: activeTermId } : {}) },
      include: {
        subject: true,
        term: true,
        enrollments: {
          where: { status: { not: EnrollmentStatus.DROPPED } },
          select: { grade: { select: { id: true } } },
        },
      },
      orderBy: [{ subject: { code: "asc" } }, { label: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Sections</h1>
      <p className="mb-6 text-sm text-slate-600">
        Sections you teach. Open one to enter marks.
      </p>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/teacher?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/teacher?termId=all"
          className={!activeTermId ? "font-medium text-slate-900" : "text-slate-500"}
        >
          All terms
        </Link>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-slate-500">No sections assigned for this term.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Graded</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const total = s.enrollments.length;
              const graded = s.enrollments.filter((e) => e.grade !== null).length;
              return (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 text-slate-900">
                    {s.subject.code} — {s.subject.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.label}</td>
                  <td className="px-4 py-2 text-slate-600">{s.term.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {graded} / {total}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/teacher/sections/${s.id}`} className="text-slate-600 underline">
                      Enter Marks
                    </Link>
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
