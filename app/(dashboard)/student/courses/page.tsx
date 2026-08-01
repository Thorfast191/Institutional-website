import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile } from "@/lib/student-access";
import { calculateGpa } from "@/lib/student-term";
import { resolveTermFilter } from "@/lib/term-filter";

export default async function StudentCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string }>;
}) {
  const { termId } = await searchParams;
  const { profile } = await requireStudentProfile();
  const activeTermId = await resolveTermFilter(termId);

  const [enrollments, terms] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        studentId: profile.id,
        ...(activeTermId ? { section: { termId: activeTermId } } : {}),
      },
      include: {
        grade: true,
        section: { include: { subject: true, term: true, teacher: { include: { user: true } } } },
      },
      orderBy: { section: { subject: { code: "asc" } } },
    }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  const active = enrollments.filter((e) => e.status !== EnrollmentStatus.DROPPED);
  const gpa = calculateGpa(
    active
      .filter((e) => e.grade !== null)
      .map((e) => ({ gradePoint: e.grade!.gradePoint, credits: e.section.subject.credits }))
  );

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Courses</h1>
      <p className="mb-6 text-sm text-slate-600">GPA: {gpa ? gpa.toFixed(2) : "—"}</p>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/student/courses?termId=${t.id}`}
            className={activeTermId === t.id ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {t.name}
          </Link>
        ))}
        <Link
          href="/student/courses?termId=all"
          className={!activeTermId ? "font-medium text-slate-900" : "text-slate-500"}
        >
          All terms
        </Link>
      </div>

      {enrollments.length === 0 ? (
        <p className="text-sm text-slate-500">You are not enrolled in any courses.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Teacher</th>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Marks</th>
              <th className="px-4 py-2 font-medium">Grade</th>
              <th className="px-4 py-2 font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => {
              const dropped = e.status === EnrollmentStatus.DROPPED;
              return (
                <tr
                  key={e.id}
                  className={`border-t border-slate-200 ${dropped ? "text-slate-400" : ""}`}
                >
                  <td className="px-4 py-2">
                    {e.section.subject.code} — {e.section.subject.name}
                  </td>
                  <td className="px-4 py-2">{e.section.label}</td>
                  <td className="px-4 py-2">{e.section.teacher.user.name}</td>
                  <td className="px-4 py-2">{e.section.term.name}</td>
                  <td className="px-4 py-2">
                    {dropped ? "Dropped" : (e.grade?.marks.toString() ?? "—")}
                  </td>
                  <td className="px-4 py-2 font-medium">{e.grade?.letterGrade ?? "—"}</td>
                  <td className="px-4 py-2">{e.grade?.gradePoint.toString() ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
