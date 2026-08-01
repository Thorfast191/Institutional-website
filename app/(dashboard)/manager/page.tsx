import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ManagerDashboardPage() {
  const [termCount, subjectCount, sectionCount, examCount, unpaidCount, activeTerm] =
    await Promise.all([
      prisma.term.count(),
      prisma.subject.count(),
      prisma.section.count(),
      prisma.exam.count(),
      prisma.feeItem.count({ where: { status: { not: "PAID" } } }),
      prisma.term.findFirst({ where: { isActive: true } }),
    ]);

  const cards = [
    { label: "Terms", count: termCount, href: "/manager/terms" },
    { label: "Subjects", count: subjectCount, href: "/manager/subjects" },
    { label: "Sections", count: sectionCount, href: "/manager/sections" },
    { label: "Exams", count: examCount, href: "/manager/exams" },
    { label: "Unpaid Fees", count: unpaidCount, href: "/manager/fees" },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Manager Dashboard</h1>
      <p className="mb-6 text-sm text-slate-600">
        {activeTerm ? (
          <>
            Active term: <span className="font-medium text-slate-900">{activeTerm.name}</span>
          </>
        ) : (
          "No active term — set one from the Terms page."
        )}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
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
