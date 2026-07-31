import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const [userCount, departmentCount, programCount, gradeScaleCount] = await Promise.all([
    prisma.user.count(),
    prisma.department.count(),
    prisma.program.count(),
    prisma.gradeScale.count(),
  ]);

  const cards = [
    { label: "Users", count: userCount, href: "/admin/users" },
    { label: "Departments", count: departmentCount, href: "/admin/departments" },
    { label: "Programs", count: programCount, href: "/admin/programs" },
    { label: "Grade Scale Bands", count: gradeScaleCount, href: "/admin/grade-scale" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Admin Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-6 hover:border-slate-300"
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{c.count}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
