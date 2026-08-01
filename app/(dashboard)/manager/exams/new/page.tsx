import { ExamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createExam } from "@/lib/actions/exams";

const EXAM_TYPES: ExamType[] = [ExamType.MIDTERM, ExamType.FINAL, ExamType.QUIZ, ExamType.OTHER];

export default async function NewExamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [subjects, terms] = await Promise.all([
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
    prisma.term.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Exam</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={createExam} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="subjectId">
          Subject
        </label>
        <select
          id="subjectId"
          name="subjectId"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a subject</option>
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
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="examType">
          Exam Type
        </label>
        <select
          id="examType"
          name="examType"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {EXAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sequence">
          Sequence
        </label>
        <input
          id="sequence"
          name="sequence"
          type="number"
          min="1"
          step="1"
          defaultValue="1"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="date">
          Date
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="startTime">
          Start Time
        </label>
        <input
          id="startTime"
          name="startTime"
          type="time"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="endTime">
          End Time
        </label>
        <input
          id="endTime"
          name="endTime"
          type="time"
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="room">
          Room
        </label>
        <input
          id="room"
          name="room"
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create
        </button>
      </form>
    </div>
  );
}
