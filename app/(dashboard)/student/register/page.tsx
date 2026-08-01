import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { isRegistrationOpen } from "@/lib/student-term";
import { formatDateInput } from "@/lib/time";
import { enrollInSection, dropOwnEnrollment } from "@/lib/actions/registration";

export default async function StudentRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();
  const open = isRegistrationOpen(activeTerm, new Date());

  const [sections, myEnrollments] = await Promise.all([
    activeTerm
      ? prisma.section.findMany({
          where: { termId: activeTerm.id },
          include: { subject: true, teacher: { include: { user: true } } },
          orderBy: [{ subject: { code: "asc" } }, { label: "asc" }],
        })
      : Promise.resolve([]),
    prisma.enrollment.findMany({
      where: { studentId: profile.id },
      select: { sectionId: true, status: true },
    }),
  ]);

  const statusBySection = new Map(myEnrollments.map((e) => [e.sectionId, e.status]));

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Course Registration</h1>
      <p className="mb-6 text-sm text-slate-600">
        {activeTerm ? (
          open ? (
            <>
              {activeTerm.name} · open until{" "}
              {formatDateInput(activeTerm.registrationClosesAt)}
            </>
          ) : (
            <>
              {activeTerm.name} · registration is closed (
              {formatDateInput(activeTerm.registrationOpensAt)} –{" "}
              {formatDateInput(activeTerm.registrationClosesAt)})
            </>
          )
        ) : (
          "No active term."
        )}
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {sections.length === 0 ? (
        <p className="text-sm text-slate-500">No sections are available.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Teacher</th>
              <th className="px-4 py-2 font-medium">Credits</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const status = statusBySection.get(s.id);
              const enrolled = status === EnrollmentStatus.ENROLLED;
              return (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 text-slate-900">
                    {s.subject.code} — {s.subject.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.label}</td>
                  <td className="px-4 py-2 text-slate-600">{s.teacher.user.name}</td>
                  <td className="px-4 py-2 text-slate-600">{s.subject.credits}</td>
                  <td className="px-4 py-2">
                    {enrolled ? (
                      open ? (
                        <form action={dropOwnEnrollment.bind(null, s.id)}>
                          <span className="mr-3 font-medium text-green-700">Enrolled</span>
                          <button type="submit" className="text-red-600 underline">
                            Drop
                          </button>
                        </form>
                      ) : (
                        <span className="font-medium text-green-700">Enrolled</span>
                      )
                    ) : open ? (
                      <form action={enrollInSection.bind(null, s.id)}>
                        <button type="submit" className="text-slate-600 underline">
                          {status === EnrollmentStatus.DROPPED ? "Re-enroll" : "Enroll"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
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
