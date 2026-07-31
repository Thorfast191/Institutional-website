import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteProgram } from "@/lib/actions/programs";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const programs = await prisma.program.findMany({
    include: { department: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Programs</h1>
        <Link
          href="/admin/programs/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Program
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Code</th>
            <th className="px-4 py-2 font-medium">Department</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {programs.map((p) => (
            <tr key={p.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{p.name}</td>
              <td className="px-4 py-2 text-slate-600">{p.code}</td>
              <td className="px-4 py-2 text-slate-600">{p.department.name}</td>
              <td className="px-4 py-2">
                <Link href={`/admin/programs/${p.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteProgram.bind(null, p.id)} className="inline">
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
