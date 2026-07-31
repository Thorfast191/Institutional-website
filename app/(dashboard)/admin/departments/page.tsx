import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteDepartment } from "@/lib/actions/departments";

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Departments</h1>
        <Link
          href="/admin/departments/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Department
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
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {departments.map((d) => (
            <tr key={d.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{d.name}</td>
              <td className="px-4 py-2 text-slate-600">{d.code}</td>
              <td className="px-4 py-2">
                <Link href={`/admin/departments/${d.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteDepartment.bind(null, d.id)} className="inline">
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
