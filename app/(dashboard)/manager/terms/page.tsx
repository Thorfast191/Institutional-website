import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteTerm, setActiveTerm } from "@/lib/actions/terms";
import { formatDateInput } from "@/lib/time";

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const terms = await prisma.term.findMany({ orderBy: { startDate: "desc" } });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Terms</h1>
        <Link
          href="/manager/terms/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Term
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Dates</th>
            <th className="px-4 py-2 font-medium">Registration</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{t.name}</td>
              <td className="px-4 py-2 text-slate-600">
                {formatDateInput(t.startDate)} – {formatDateInput(t.endDate)}
              </td>
              <td className="px-4 py-2 text-slate-600">
                {formatDateInput(t.registrationOpensAt)} – {formatDateInput(t.registrationClosesAt)}
              </td>
              <td className="px-4 py-2">
                {t.isActive ? (
                  <span className="font-medium text-green-700">Active</span>
                ) : (
                  <form action={setActiveTerm.bind(null, t.id)}>
                    <button type="submit" className="text-slate-600 underline">
                      Set Active
                    </button>
                  </form>
                )}
              </td>
              <td className="px-4 py-2">
                <Link href={`/manager/terms/${t.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
                <form action={deleteTerm.bind(null, t.id)} className="inline">
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
