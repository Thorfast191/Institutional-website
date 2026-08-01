import { DayOfWeek, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentProfile, getActiveTerm } from "@/lib/student-access";
import { formatTimeInput } from "@/lib/time";

const DAYS: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

function dayLabel(day: DayOfWeek): string {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export default async function StudentRoutinePage() {
  const { profile } = await requireStudentProfile();
  const activeTerm = await getActiveTerm();

  const enrollments = activeTerm
    ? await prisma.enrollment.findMany({
        where: {
          studentId: profile.id,
          status: { not: EnrollmentStatus.DROPPED },
          section: { termId: activeTerm.id },
        },
        include: {
          section: {
            include: { subject: true, routines: { orderBy: { startTime: "asc" } } },
          },
        },
      })
    : [];

  const slots = enrollments.flatMap((e) =>
    e.section.routines.map((r) => ({
      day: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room,
      code: e.section.subject.code,
      label: e.section.label,
    }))
  );

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Weekly Routine</h1>
      <p className="mb-6 text-sm text-slate-600">{activeTerm?.name ?? "No active term."}</p>

      {slots.length === 0 ? (
        <p className="text-sm text-slate-500">No scheduled classes.</p>
      ) : (
        <div className="space-y-4">
          {DAYS.map((day) => {
            const daySlots = slots
              .filter((s) => s.day === day)
              .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            if (daySlots.length === 0) return null;
            return (
              <div key={day} className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-2 font-medium text-slate-900">{dayLabel(day)}</h2>
                <ul className="space-y-1 text-sm text-slate-600">
                  {daySlots.map((s, i) => (
                    <li key={i}>
                      {formatTimeInput(s.startTime)} – {formatTimeInput(s.endTime)} ·{" "}
                      <span className="text-slate-900">
                        {s.code} ({s.label})
                      </span>{" "}
                      · {s.room}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
