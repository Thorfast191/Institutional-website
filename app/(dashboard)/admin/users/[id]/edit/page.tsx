import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateUser, resetUserPassword, toggleUserActive } from "@/lib/actions/users";
import { UserForm } from "../../_components/user-form";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const { error, success } = await searchParams;

  const [user, departments, programs] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true, studentProfile: true },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  const updateWithId = updateUser.bind(null, id);
  const resetPasswordWithId = resetUserPassword.bind(null, id);
  const toggleActiveWithId = toggleUserActive.bind(null, id, user.isActive);

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Edit User</h1>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {success === "password-reset" && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Password updated.</p>
      )}

      <UserForm
        mode="edit"
        action={updateWithId}
        departments={departments}
        programs={programs}
        defaultValues={{
          role: user.role,
          name: user.name,
          email: user.email,
          employeeId: user.teacherProfile?.employeeId,
          departmentId: user.teacherProfile?.departmentId,
          designation: user.teacherProfile?.designation,
          studentId: user.studentProfile?.studentId,
          programId: user.studentProfile?.programId,
        }}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-slate-700">Reset Password</h2>
        <form action={resetPasswordWithId}>
          <input
            name="password"
            type="password"
            minLength={8}
            placeholder="New password"
            required
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Set New Password
          </button>
        </form>
      </div>

      <form action={toggleActiveWithId}>
        <button
          type="submit"
          className={`w-full rounded-md px-4 py-2 text-sm font-medium ${
            user.isActive
              ? "border border-red-300 text-red-700 hover:bg-red-50"
              : "border border-green-300 text-green-700 hover:bg-green-50"
          }`}
        >
          {user.isActive ? "Deactivate Account" : "Reactivate Account"}
        </button>
      </form>
    </div>
  );
}
