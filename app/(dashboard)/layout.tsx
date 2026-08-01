import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/departments", label: "Departments" },
  { href: "/admin/programs", label: "Programs" },
  { href: "/admin/grade-scale", label: "Grade Scale" },
];

const MANAGER_NAV = [
  { href: "/manager", label: "Overview" },
  { href: "/manager/terms", label: "Terms" },
  { href: "/manager/subjects", label: "Subjects" },
  { href: "/manager/sections", label: "Sections" },
  { href: "/manager/exams", label: "Exams" },
  { href: "/manager/fees", label: "Fees" },
];

// Teacher and Student stay absent until their own phases build those screens.
const NAV_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  ADMIN: ADMIN_NAV,
  MANAGER: MANAGER_NAV,
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.role) {
    redirect("/login");
  }

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const nav = NAV_BY_ROLE[session.user.role] ?? [];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-sm text-slate-500">Signed in as</p>
          <p className="font-medium text-slate-900">
            {session.user.name} · {ROLE_LABEL[session.user.role]}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </header>
      {nav.length > 0 && (
        <nav className="flex gap-4 border-b border-slate-200 bg-white px-6 py-2 text-sm">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-slate-600 hover:text-slate-900">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      <main className="p-6">{children}</main>
    </div>
  );
}
