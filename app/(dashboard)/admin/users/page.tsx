import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["ADMIN", "MANAGER", "TEACHER", "STUDENT"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const roleFilter = role && ROLES.includes(role as Role) ? (role as Role) : undefined;

  const users = await prisma.user.findMany({
    where: roleFilter ? { role: roleFilter } : undefined,
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New User
        </Link>
      </div>

      <div className="mb-4 flex gap-4 text-sm">
        <Link href="/admin/users" className={!roleFilter ? "font-medium text-slate-900" : "text-slate-500"}>
          All
        </Link>
        {ROLES.map((r) => (
          <Link
            key={r}
            href={`/admin/users?role=${r}`}
            className={roleFilter === r ? "font-medium text-slate-900" : "text-slate-500"}
          >
            {r}
          </Link>
        ))}
      </div>

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-slate-200">
              <td className="px-4 py-2 text-slate-900">{u.name}</td>
              <td className="px-4 py-2 text-slate-600">{u.email}</td>
              <td className="px-4 py-2 text-slate-600">{u.role}</td>
              <td className="px-4 py-2">
                <span className={u.isActive ? "text-green-700" : "text-red-700"}>
                  {u.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-2">
                <Link href={`/admin/users/${u.id}/edit`} className="text-slate-600 underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
