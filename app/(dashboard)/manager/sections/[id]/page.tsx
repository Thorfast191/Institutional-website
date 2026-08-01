import Link from "next/link";
import { notFound } from "next/navigation";
import { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createRoutine, updateRoutine, deleteRoutine } from "@/lib/actions/routines";
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

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm";

function dayLabel(day: DayOfWeek): string {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export default async function SectionDetailPage({
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
      teacher: { include: { user: true } },
      routines: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
    },
  });
  if (!section) notFound();

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/manager/sections" className="text-sm text-slate-500 underline">
          ← Back to sections
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {section.subject.code} — Section {section.label}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {section.subject.name} · {section.term.name} · {section.teacher.user.name}
        </p>
        <Link
          href={`/manager/sections/${section.id}/enrollments`}
          className="mt-2 inline-block text-sm text-slate-600 underline"
        >
          View roster
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <h2 className="mb-3 text-lg font-medium text-slate-900">Weekly Schedule</h2>

      {section.routines.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">No slots scheduled yet.</p>
      ) : (
        <div className="mb-6 space-y-3">
          {section.routines.map((r) => (
            // The update and delete forms sit side by side rather than nested —
            // HTML does not allow a form inside a form.
            <div
              key={r.id}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
            >
              <form
                action={updateRoutine.bind(null, r.id)}
                className="flex flex-1 flex-wrap items-end gap-2"
              >
                <input type="hidden" name="sectionId" value={section.id} />
                <select name="dayOfWeek" defaultValue={r.dayOfWeek} className={inputClass}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {dayLabel(d)}
                    </option>
                  ))}
                </select>
                <input
                  name="startTime"
                  type="time"
                  defaultValue={formatTimeInput(r.startTime)}
                  required
                  className={inputClass}
                />
                <input
                  name="endTime"
                  type="time"
                  defaultValue={formatTimeInput(r.endTime)}
                  required
                  className={inputClass}
                />
                <input
                  name="room"
                  defaultValue={r.room}
                  required
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Save
                </button>
              </form>

              <form action={deleteRoutine.bind(null, r.id, section.id)}>
                <button
                  type="submit"
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-6 text-lg font-medium text-slate-900">Add a Slot</h2>
      <form
        action={createRoutine}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <input type="hidden" name="sectionId" value={section.id} />
        <select name="dayOfWeek" defaultValue={DayOfWeek.SUNDAY} className={inputClass}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {dayLabel(d)}
            </option>
          ))}
        </select>
        <input name="startTime" type="time" required className={inputClass} />
        <input name="endTime" type="time" required className={inputClass} />
        <input name="room" placeholder="Room" required className={`${inputClass} flex-1`} />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add
        </button>
      </form>
    </div>
  );
}
