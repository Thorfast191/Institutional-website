import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { formatDateInput, formatTimeInput } from "@/lib/time";

export default async function StudentExamsPage() {
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();

  const enrollments = activeTerm
    ? await prisma.enrollment.findMany({
        where: {
          studentId: profile.id,
          status: { not: EnrollmentStatus.DROPPED },
          section: { termId: activeTerm.id },
        },
        select: { section: { select: { subjectId: true } } },
      })
    : [];

  const subjectIds = [...new Set(enrollments.map((e) => e.section.subjectId))];

  const exams =
    activeTerm && subjectIds.length > 0
      ? await prisma.exam.findMany({
          where: { termId: activeTerm.id, subjectId: { in: subjectIds } },
          include: { subject: true },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        })
      : [];

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Exam Schedule</h1>
      <p className="mb-6 text-sm text-slate-600">{activeTerm?.name ?? "No active term."}</p>

      {exams.length === 0 ? (
        <p className="text-sm text-slate-500">No exams scheduled for your courses.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Room</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
