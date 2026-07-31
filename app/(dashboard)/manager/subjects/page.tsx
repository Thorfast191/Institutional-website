import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteSubject } from "@/lib/actions/subjects";

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const subjects = await prisma.subject.findMany({
    include: { program: true },
    orderBy: { code: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Subjects</h1>
        <Link
          href="/manager/subjects/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Subject
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Code</th>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Credits</th>
            <th className="px-4 py-2 font-medium">Program</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{s.code}</td>
              <td className="px-4 py-2 text-slate-600">{s.name}</td>
              <td className="px-4 py-2 text-slate-600">{s.credits}</td>
              <td className="px-4 py-2 text-slate-600">{s.program.name}</td>
              <td className="px-4 py-2">
                <Link href={`/manager/subjects/${s.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteSubject.bind(null, s.id)} className="inline">
                  <button type="submit" className="ml-3 text-red-600 underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
