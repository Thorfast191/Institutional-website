import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dropEnrollment } from "@/lib/actions/enrollments";

export default async function SectionEnrollmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      subject: true,
      term: true,
      enrollments: {
        include: {
          student: { include: { user: true } },
          droppedByUser: true,
        },
        orderBy: { enrolledAt: "asc" },
      },
    },
  });
  if (!section) notFound();

  const active = section.enrollments.filter((e) => e.status !== EnrollmentStatus.DROPPED);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href={`/manager/sections/${section.id}`} className="text-sm text-slate-500 underline">
          ← Back to section
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Roster — {section.subject.code} Section {section.label}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {section.term.name} · {active.length} enrolled
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {section.enrollments.length === 0 ? (
        <p className="text-sm text-slate-500">No students have enrolled yet.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Student ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Dropped</th>
              <th className="px-4 py-2 font-medium">Actions</th>
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
                  <td className="px-4 py-2">{e.status}</td>
                  <td className="px-4 py-2">
                    {dropped && e.droppedAt
                      ? `${e.droppedAt.toISOString().slice(0, 10)} by ${
                          e.droppedByUser?.name ?? "unknown"
                        }`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {dropped ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <form action={dropEnrollment.bind(null, e.id, section.id)}>
                        <button type="submit" className="text-red-600 underline">
                          Force Drop
                        </button>
                      </form>
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
