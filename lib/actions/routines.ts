"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { routineSchema } from "@/lib/validation/routine";
import { parseTimeInput } from "@/lib/time";

function readRoutineForm(formData: FormData) {
  return {
    sectionId: formData.get("sectionId"),
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    room: formData.get("room"),
  };
}

export async function createRoutine(formData: FormData) {
  await requireRole(["MANAGER"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  const parsed = routineSchema.safeParse(readRoutineForm(formData));
  if (!parsed.success) {
    redirect(
      `/manager/sections/${sectionId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const data = parsed.data;
  await prisma.routine.create({
    data: {
      sectionId: data.sectionId,
      dayOfWeek: data.dayOfWeek,
      startTime: parseTimeInput(data.startTime),
      endTime: parseTimeInput(data.endTime),
      room: data.room,
    },
  });

  redirect(`/manager/sections/${data.sectionId}`);
}

export async function updateRoutine(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  const parsed = routineSchema.safeParse(readRoutineForm(formData));
  if (!parsed.success) {
    redirect(
      `/manager/sections/${sectionId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const data = parsed.data;
  await prisma.routine.update({
    where: { id },
    data: {
      dayOfWeek: data.dayOfWeek,
      startTime: parseTimeInput(data.startTime),
      endTime: parseTimeInput(data.endTime),
      room: data.room,
    },
  });

  redirect(`/manager/sections/${data.sectionId}`);
}

export async function deleteRoutine(id: string, sectionId: string) {
  await requireRole(["MANAGER"]);
  await prisma.routine.delete({ where: { id } });
  redirect(`/manager/sections/${sectionId}`);
}
