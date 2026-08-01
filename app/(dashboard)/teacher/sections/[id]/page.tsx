import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTeacherProfile, findOwnedSection } from "@/lib/teacher-access";
import { saveGrade } from "@/lib/actions/grades";

export default async function TeacherSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { teacherId } = await requireTeacherProfile();

  // A section that is not this teacher's is indistinguishable from one that
  // does not exist — no information leaks about other teachers' sections.
  const owned = await findOwnedSection(id, teacherId);
  if (!owned) notFound();

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      subject: true,
      term: true,
      enrollments: {
        include: {
          student: { include: { user: true } },
          grade: true,
        },
        orderBy: { student: { studentId: "asc" } },
      },
    },
  });
  if (!section) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/teacher" className="text-sm text-slate-500 underline">
          ← Back to my sections
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {section.subject.code} — Section {section.label}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {section.subject.name} · {section.term.name}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {section.enrollments.length === 0 ? (
        <p className="text-sm text-slate-500">No students are enrolled in this section.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Student ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Marks</th>
              <th className="px-4 py-2 font-medium">Grade</th>
              <th className="px-4 py-2 font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {section.enrollments.map((e) => {
              const dropped = e.status === EnrollmentStatus.DROPPED;
              return (
                <tr
                  key={e.id}
                  className={`border-t border-slate-200 ${dropped ? "text-slate-400" : ""}`}
                >
                  <td className="px-4 py-2">{e.student.studentId}</td>
                  <td className="px-4 py-2">{e.student.user.name}</td>
                  <td className="px-4 py-2">
                    {dropped ? (
                      "Dropped"
                    ) : (
                      <form
                        action={saveGrade.bind(null, section.id)}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <input
                          name="marks"
                          type="text"
                          inputMode="decimal"
                          defaultValue={e.grade?.marks.toString() ?? ""}
                          placeholder="0–100"
                          required
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Save
                        </button>
                      </form>
                    )}
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
