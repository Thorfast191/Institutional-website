import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/actions/users";
import { UserForm } from "../_components/user-form";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [departments, programs] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New User</h1>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <UserForm mode="create" action={createUser} departments={departments} programs={programs} />
    </div>
  );
}
