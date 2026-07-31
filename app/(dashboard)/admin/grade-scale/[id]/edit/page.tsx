import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateGradeBand } from "@/lib/actions/grade-scale";

export default async function EditGradeBandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const band = await prisma.gradeScale.findUnique({ where: { id } });
  if (!band) notFound();

  const updateWithId = updateGradeBand.bind(null, id);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit Grade Band</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="minMarks">
          Min Marks
        </label>
        <input
          id="minMarks"
          name="minMarks"
          type="number"
          step="0.01"
          defaultValue={band.minMarks.toString()}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="maxMarks">
          Max Marks
        </label>
        <input
          id="maxMarks"
          name="maxMarks"
          type="number"
          step="0.01"
          defaultValue={band.maxMarks.toString()}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="letterGrade">
          Letter Grade
        </label>
        <input
          id="letterGrade"
          name="letterGrade"
          defaultValue={band.letterGrade}
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="gradePoint">
          Grade Point
        </label>
        <input
          id="gradePoint"
          name="gradePoint"
          type="number"
          step="0.01"
          defaultValue={band.gradePoint.toString()}
          required
          className="mb-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save
        </button>
      </form>
    </div>
  );
}
