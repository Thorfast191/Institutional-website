"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import type { ExamType } from "@prisma/client";
import { examSchema } from "@/lib/validation/exam";
import { parseDateInput, parseTimeInput } from "@/lib/time";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

const DUPLICATE_MESSAGE = "That exam already exists for this subject and term.";

function readExamForm(formData: FormData) {
  return {
    subjectId: formData.get("subjectId"),
    termId: formData.get("termId"),
    examType: formData.get("examType"),
    sequence: formData.get("sequence"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    room: formData.get("room"),
  };
}

function toExamData(data: {
  subjectId: string;
  termId: string;
  examType: ExamType;
  sequence: number;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
}) {
  return {
    subjectId: data.subjectId,
    termId: data.termId,
    examType: data.examType,
    sequence: data.sequence,
    date: parseDateInput(data.date),
    startTime: parseTimeInput(data.startTime),
    endTime: parseTimeInput(data.endTime),
    room: data.room,
  };
}

export async function createExam(formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = examSchema.safeParse(readExamForm(formData));
  if (!parsed.success) {
    redirect(`/manager/exams/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.exam.create({ data: toExamData(parsed.data) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/exams/new?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/manager/exams");
}

export async function updateExam(id: string, formData: FormData) {
  await requireRole(["MANAGER"]);

  const parsed = examSchema.safeParse(readExamForm(formData));
  if (!parsed.success) {
    redirect(`/manager/exams/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  try {
    await prisma.exam.update({ where: { id }, data: toExamData(parsed.data) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(`/manager/exams/${id}/edit?error=${encodeURIComponent(DUPLICATE_MESSAGE)}`);
    }
    throw error;
  }

  redirect("/manager/exams");
}

export async function deleteExam(id: string) {
  await requireRole(["MANAGER"]);
  await prisma.exam.delete({ where: { id } });
  redirect("/manager/exams");
}
