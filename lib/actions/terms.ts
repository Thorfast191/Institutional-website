"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { termSchema } from "@/lib/validation/term";
import { parseDateInput } from "@/lib/time";
import { isRestrictConstraintError } from "@/lib/prisma-errors";

function readTermForm(formData: FormData) {
  return {
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    registrationOpensAt: formData.get("registrationOpensAt"),
    registrationClosesAt: formData.get("registrationClosesAt"),
  };
}

function toTermData(data: {
  name: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
}) {
  return {
    name: data.name,
    startDate: parseDateInput(data.startDate),
    endDate: parseDateInput(data.endDate),
    registrationOpensAt: parseDateInput(data.registrationOpensAt),
    registrationClosesAt: parseDateInput(data.registrationClosesAt),
  };
}

export async function createTerm(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = termSchema.safeParse(readTermForm(formData));
  if (!parsed.success) {
    redirect(`/manager/terms/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  await prisma.term.create({ data: toTermData(parsed.data) });
  redirect("/manager/terms");
}

export async function updateTerm(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = termSchema.safeParse(readTermForm(formData));
  if (!parsed.success) {
    redirect(`/manager/terms/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  await prisma.term.update({ where: { id }, data: toTermData(parsed.data) });
  redirect("/manager/terms");
}

export async function deleteTerm(id: string) {
  await requireRole(["MANAGER"]);

  try {
    await prisma.term.delete({ where: { id } });
  } catch (error) {
    if (isRestrictConstraintError(error)) {
      redirect(
        `/manager/terms?error=${encodeURIComponent(
          "Cannot delete — one or more sections, exams, or fee items still reference this term."
        )}`
      );
    }
    throw error;
  }

  redirect("/manager/terms");
}

// Phase 1 requires exactly one active Term. Flipping the chosen term on and
// every other term off in a single transaction enforces that structurally, so
// there is no error state to explain and no window with zero active terms.
export async function setActiveTerm(id: string) {
  await requireRole(["MANAGER"]);

  await prisma.$transaction([
    prisma.term.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.term.update({ where: { id }, data: { isActive: true } }),
  ]);

  redirect("/manager/terms");
}
