import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { isRegistrationOpen, calculateGpa } from "@/lib/student-term";
import { formatDateInput } from "@/lib/time";

export default async function StudentDashboardPage() {
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();
  const open = isRegistrationOpen(activeTerm, new Date());

  const enrollments = activeTerm
    ? await prisma.enrollment.findMany({
        where: {
          studentId: profile.id,
          status: { not: EnrollmentStatus.DROPPED },
          section: { termId: activeTerm.id },
        },
        include: { grade: true, section: { include: { subject: true } } },
      })
    : [];

  const graded = enrollments.filter((e) => e.grade !== null);
  const gpa = calculateGpa(
    graded.map((e) => ({ gradePoint: e.grade!.gradePoint, credits: e.section.subject.credits }))
  );

  const unpaid = await prisma.feeItem.count({
    where: { studentId: profile.id, status: { not: "PAID" } },
  });

  const cards = [
    { label: "Courses", value: String(enrollments.length), href: "/student/courses" },
    { label: "Graded", value: `${graded.length} / ${enrollments.length}`, href: "/student/courses" },
    { label: "GPA", value: gpa ? gpa.toFixed(2) : "—", href: "/student/courses" },
    { label: "Unpaid Fees", value: String(unpaid), href: "/student/dues" },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">My Dashboard</h1>
      <p className="mb-1 text-sm text-slate-600">Student ID: {profile.studentId}</p>
      <p className="mb-6 text-sm text-slate-600">
        {activeTerm ? (
          <>
            {activeTerm.name} · registration{" "}
            {open ? (
              <span className="font-medium text-green-700">
                open until {formatDateInput(activeTerm.registrationClosesAt)}
              </span>
            ) : (
              <span className="font-medium text-slate-700">closed</span>
            )}
          </>
        ) : (
          "No active term."
        )}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-300"
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{c.value}</p>
          </Link>
        ))}
      </div>

      {open && (
        <Link
          href="/student/register"
          className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Register for Courses
        </Link>
      )}
    </div>
  );
}
