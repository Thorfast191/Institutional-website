import {
  PrismaClient,
  Role,
  FeeType,
  FeeStatus,
  PaymentMethod,
  ExamType,
  EnrollmentStatus,
  DayOfWeek,
} from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "Passw0rd!";

async function createUser(params: { name: string; email: string; role: Role }) {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  return prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      role: params.role,
      passwordHash,
    },
  });
}

async function main() {
  console.log("Seeding database...");

  const cse = await prisma.department.create({
    data: { name: "Computer Science & Engineering", code: "CSE" },
  });
  const eee = await prisma.department.create({
    data: { name: "Electrical & Electronic Engineering", code: "EEE" },
  });

  const bscCse = await prisma.program.create({
    data: { name: "BSc in Computer Science & Engineering", code: "BSC-CSE", departmentId: cse.id },
  });
  const mscCse = await prisma.program.create({
    data: { name: "MSc in Computer Science & Engineering", code: "MSC-CSE", departmentId: cse.id },
  });
  const bscEee = await prisma.program.create({
    data: { name: "BSc in Electrical & Electronic Engineering", code: "BSC-EEE", departmentId: eee.id },
  });

  const pastTerm = await prisma.term.create({
    data: {
      name: "Spring 2026",
      startDate: new Date("2026-01-05"),
      endDate: new Date("2026-04-30"),
      isActive: false,
      registrationOpensAt: new Date("2025-12-15"),
      registrationClosesAt: new Date("2026-01-10"),
    },
  });
  const currentTerm = await prisma.term.create({
    data: {
      name: "Summer 2026",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-09-15"),
      isActive: true,
      registrationOpensAt: new Date("2026-07-01"),
      registrationClosesAt: new Date("2026-08-15"),
    },
  });

  // Decimal columns take strings, not JS numbers: 89.99 as a double is
  // 89.98999999999999..., which Postgres stores verbatim and which would leave
  // a gap between adjacent bands when grades are looked up by marks.
  await prisma.gradeScale.createMany({
    data: [
      { minMarks: "90", maxMarks: "100", letterGrade: "A+", gradePoint: "4.00" },
      { minMarks: "85", maxMarks: "89.99", letterGrade: "A", gradePoint: "3.75" },
      { minMarks: "80", maxMarks: "84.99", letterGrade: "A-", gradePoint: "3.50" },
      { minMarks: "75", maxMarks: "79.99", letterGrade: "B+", gradePoint: "3.25" },
      { minMarks: "70", maxMarks: "74.99", letterGrade: "B", gradePoint: "3.00" },
      { minMarks: "65", maxMarks: "69.99", letterGrade: "B-", gradePoint: "2.75" },
      { minMarks: "60", maxMarks: "64.99", letterGrade: "C+", gradePoint: "2.50" },
      { minMarks: "50", maxMarks: "59.99", letterGrade: "C", gradePoint: "2.00" },
      { minMarks: "40", maxMarks: "49.99", letterGrade: "D", gradePoint: "1.00" },
      { minMarks: "0", maxMarks: "39.99", letterGrade: "F", gradePoint: "0.00" },
    ],
  });

  const subjectsData = [
    { name: "Structured Programming", code: "CSE101", credits: 3, programId: bscCse.id },
    { name: "Data Structures", code: "CSE201", credits: 3, programId: bscCse.id },
    { name: "Algorithms", code: "CSE301", credits: 3, programId: bscCse.id },
    { name: "Database Systems", code: "CSE302", credits: 3, programId: bscCse.id },
    { name: "Advanced Machine Learning", code: "CSE501", credits: 3, programId: mscCse.id },
    { name: "Circuit Analysis", code: "EEE101", credits: 3, programId: bscEee.id },
    { name: "Digital Logic Design", code: "EEE201", credits: 3, programId: bscEee.id },
  ];
  const subjects = [];
  for (const s of subjectsData) {
    subjects.push(await prisma.subject.create({ data: s }));
  }
  const [cse101, cse201, cse301, cse302, , eee101, eee201] = subjects;

  const admin = await createUser({ name: "Ayesha Rahman", email: "admin@school.edu", role: Role.ADMIN });
  const manager = await createUser({ name: "Farhan Kabir", email: "manager@school.edu", role: Role.MANAGER });

  const teacherUsersData = [
    { name: "Dr. Nusrat Jahan", email: "nusrat.jahan@school.edu", employeeId: "EMP-001", departmentId: cse.id, designation: "Associate Professor" },
    { name: "Dr. Kamal Hossain", email: "kamal.hossain@school.edu", employeeId: "EMP-002", departmentId: cse.id, designation: "Assistant Professor" },
    { name: "Dr. Shirin Akter", email: "shirin.akter@school.edu", employeeId: "EMP-003", departmentId: eee.id, designation: "Professor" },
  ];
  const teacherProfiles = [];
  for (const t of teacherUsersData) {
    const user = await createUser({ name: t.name, email: t.email, role: Role.TEACHER });
    teacherProfiles.push(
      await prisma.teacherProfile.create({
        data: {
          userId: user.id,
          employeeId: t.employeeId,
          departmentId: t.departmentId,
          designation: t.designation,
        },
      })
    );
  }
  const [teacherNusrat, teacherKamal, teacherShirin] = teacherProfiles;

  const sectionsData = [
    { subjectId: cse101.id, termId: pastTerm.id, teacherId: teacherNusrat.id, label: "A" },
    { subjectId: cse101.id, termId: currentTerm.id, teacherId: teacherNusrat.id, label: "A" },
    { subjectId: cse101.id, termId: currentTerm.id, teacherId: teacherKamal.id, label: "B" },
    { subjectId: cse201.id, termId: pastTerm.id, teacherId: teacherKamal.id, label: "A" },
    { subjectId: cse201.id, termId: currentTerm.id, teacherId: teacherKamal.id, label: "A" },
    { subjectId: cse301.id, termId: currentTerm.id, teacherId: teacherNusrat.id, label: "A" },
    { subjectId: cse302.id, termId: currentTerm.id, teacherId: teacherKamal.id, label: "A" },
    { subjectId: eee101.id, termId: currentTerm.id, teacherId: teacherShirin.id, label: "A" },
    { subjectId: eee201.id, termId: currentTerm.id, teacherId: teacherShirin.id, label: "A" },
  ];
  const createdSections = [];
  for (const s of sectionsData) {
    createdSections.push(await prisma.section.create({ data: s }));
  }
  const [
    cse101PastA,
    cse101CurA,
    cse101CurB,
    cse201PastA,
    cse201CurA,
    cse301CurA,
    cse302CurA,
    eee101CurA,
    eee201CurA,
  ] = createdSections;

  await prisma.routine.createMany({
    data: [
      { sectionId: cse101CurA.id, dayOfWeek: DayOfWeek.SUNDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 301" },
      { sectionId: cse101CurA.id, dayOfWeek: DayOfWeek.TUESDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 301" },
      { sectionId: cse101CurB.id, dayOfWeek: DayOfWeek.MONDAY, startTime: new Date("1970-01-01T11:00:00Z"), endTime: new Date("1970-01-01T12:20:00Z"), room: "Room 302" },
      { sectionId: cse201CurA.id, dayOfWeek: DayOfWeek.SUNDAY, startTime: new Date("1970-01-01T11:00:00Z"), endTime: new Date("1970-01-01T12:20:00Z"), room: "Room 303" },
      { sectionId: cse301CurA.id, dayOfWeek: DayOfWeek.WEDNESDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 304" },
      { sectionId: cse302CurA.id, dayOfWeek: DayOfWeek.THURSDAY, startTime: new Date("1970-01-01T13:00:00Z"), endTime: new Date("1970-01-01T14:20:00Z"), room: "Lab 1" },
      { sectionId: eee101CurA.id, dayOfWeek: DayOfWeek.MONDAY, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T10:20:00Z"), room: "Room 201" },
      { sectionId: eee201CurA.id, dayOfWeek: DayOfWeek.WEDNESDAY, startTime: new Date("1970-01-01T11:00:00Z"), endTime: new Date("1970-01-01T12:20:00Z"), room: "Room 202" },
    ],
  });

  await prisma.exam.createMany({
    data: [
      { subjectId: cse101.id, termId: currentTerm.id, examType: ExamType.QUIZ, sequence: 1, date: new Date("2026-07-20"), startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T09:30:00Z"), room: "Room 301" },
      { subjectId: cse101.id, termId: currentTerm.id, examType: ExamType.QUIZ, sequence: 2, date: new Date("2026-08-10"), startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T09:30:00Z"), room: "Room 301" },
      { subjectId: cse101.id, termId: currentTerm.id, examType: ExamType.MIDTERM, sequence: 1, date: new Date("2026-08-01"), startTime: new Date("1970-01-01T10:00:00Z"), endTime: new Date("1970-01-01T12:00:00Z"), room: "Exam Hall 1" },
      { subjectId: cse201.id, termId: currentTerm.id, examType: ExamType.MIDTERM, sequence: 1, date: new Date("2026-08-02"), startTime: new Date("1970-01-01T10:00:00Z"), endTime: new Date("1970-01-01T12:00:00Z"), room: "Exam Hall 2" },
      { subjectId: cse101.id, termId: pastTerm.id, examType: ExamType.FINAL, sequence: 1, date: new Date("2026-04-25"), startTime: new Date("1970-01-01T10:00:00Z"), endTime: new Date("1970-01-01T13:00:00Z"), room: "Exam Hall 1" },
    ],
  });

  const studentUsersData = [
    { name: "Tanvir Ahmed", email: "tanvir.ahmed@student.school.edu", studentId: "STU-1001", programId: bscCse.id },
    { name: "Sadia Islam", email: "sadia.islam@student.school.edu", studentId: "STU-1002", programId: bscCse.id },
    { name: "Rakib Hasan", email: "rakib.hasan@student.school.edu", studentId: "STU-1003", programId: bscCse.id },
    { name: "Nabila Yasmin", email: "nabila.yasmin@student.school.edu", studentId: "STU-1004", programId: bscCse.id },
    { name: "Imran Chowdhury", email: "imran.chowdhury@student.school.edu", studentId: "STU-1005", programId: bscEee.id },
    { name: "Farzana Akter", email: "farzana.akter@student.school.edu", studentId: "STU-1006", programId: bscEee.id },
  ];
  const studentProfiles = [];
  for (const s of studentUsersData) {
    const user = await createUser({ name: s.name, email: s.email, role: Role.STUDENT });
    studentProfiles.push(
      await prisma.studentProfile.create({
        data: { userId: user.id, studentId: s.studentId, programId: s.programId },
      })
    );
  }
  const [tanvir, sadia, rakib, nabila, imran, farzana] = studentProfiles;

  const currentEnrollments = [
    { studentId: tanvir.id, sectionId: cse101CurA.id },
    { studentId: sadia.id, sectionId: cse101CurA.id },
    { studentId: rakib.id, sectionId: cse101CurB.id },
    { studentId: tanvir.id, sectionId: cse201CurA.id },
    { studentId: nabila.id, sectionId: cse301CurA.id },
    { studentId: sadia.id, sectionId: cse302CurA.id },
    { studentId: imran.id, sectionId: eee101CurA.id },
    { studentId: farzana.id, sectionId: eee201CurA.id },
  ];
  for (const e of currentEnrollments) {
    await prisma.enrollment.create({ data: { ...e, status: EnrollmentStatus.ENROLLED } });
  }

  // Force-dropped enrollment — demonstrates the audit trail.
  await prisma.enrollment.create({
    data: {
      studentId: rakib.id,
      sectionId: cse201CurA.id,
      status: EnrollmentStatus.DROPPED,
      droppedAt: new Date("2026-07-15"),
      droppedBy: manager.id,
    },
  });

  const pastEnrollment1 = await prisma.enrollment.create({
    data: { studentId: tanvir.id, sectionId: cse101PastA.id, status: EnrollmentStatus.COMPLETED },
  });
  const pastEnrollment2 = await prisma.enrollment.create({
    data: { studentId: sadia.id, sectionId: cse101PastA.id, status: EnrollmentStatus.COMPLETED },
  });
  const pastEnrollment3 = await prisma.enrollment.create({
    data: { studentId: rakib.id, sectionId: cse201PastA.id, status: EnrollmentStatus.COMPLETED },
  });

  await prisma.grade.createMany({
    data: [
      { enrollmentId: pastEnrollment1.id, marks: 92, letterGrade: "A+", gradePoint: 4.0, gradedBy: teacherNusrat.userId },
      { enrollmentId: pastEnrollment2.id, marks: 78, letterGrade: "B+", gradePoint: 3.25, gradedBy: teacherNusrat.userId },
      { enrollmentId: pastEnrollment3.id, marks: 64, letterGrade: "C+", gradePoint: 2.5, gradedBy: teacherKamal.userId },
    ],
  });

  // Decimal amounts are strings, never JS numbers. A number round-trips through
  // a double and silently rewrites values like 89.99 — the corruption this
  // project hit on GradeScale in Phase 2. These happen to be whole numbers, but
  // the rule holds everywhere so editing one to have cents stays safe.
  const [tanvirTuition, tanvirLab, sadiaTuition] = await Promise.all([
    prisma.feeItem.create({ data: { studentId: tanvir.id, termId: currentTerm.id, feeType: FeeType.TUITION, amount: "45000", dueDate: new Date("2026-07-10") } }),
    prisma.feeItem.create({ data: { studentId: tanvir.id, termId: currentTerm.id, feeType: FeeType.LAB, amount: "3000", dueDate: new Date("2026-07-10") } }),
    prisma.feeItem.create({ data: { studentId: sadia.id, termId: currentTerm.id, feeType: FeeType.TUITION, amount: "45000", dueDate: new Date("2026-07-10") } }),
  ]);
  await prisma.feeItem.create({ data: { studentId: rakib.id, termId: currentTerm.id, feeType: FeeType.TUITION, amount: "45000", dueDate: new Date("2026-07-10") } });
  const nabilaLibrary = await prisma.feeItem.create({ data: { studentId: nabila.id, termId: currentTerm.id, feeType: FeeType.LIBRARY, amount: "1500", dueDate: new Date("2026-07-15") } });

  await prisma.payment.create({
    data: { feeItemId: tanvirTuition.id, amount: "45000", method: PaymentMethod.BANK, reference: "TXN-0001", recordedBy: manager.id },
  });
  await prisma.feeItem.update({ where: { id: tanvirTuition.id }, data: { status: FeeStatus.PAID } });
  // tanvirLab is left UNPAID (no payment recorded).
  void tanvirLab;

  await prisma.payment.create({
    data: { feeItemId: sadiaTuition.id, amount: "20000", method: PaymentMethod.CASH, recordedBy: manager.id },
  });
  await prisma.feeItem.update({ where: { id: sadiaTuition.id }, data: { status: FeeStatus.PARTIAL } });

  await prisma.payment.create({
    data: { feeItemId: nabilaLibrary.id, amount: "1500", method: PaymentMethod.ONLINE, reference: "TXN-0002", recordedBy: manager.id },
  });
  await prisma.feeItem.update({ where: { id: nabilaLibrary.id }, data: { status: FeeStatus.PAID } });

  console.log("\nSeed complete.");
  console.log(`Password for every account below: ${DEFAULT_PASSWORD}\n`);
  console.log(`Admin:    ${admin.email}`);
  console.log(`Manager:  ${manager.email}`);
  teacherUsersData.forEach((t) => console.log(`Teacher:  ${t.email}`));
  studentUsersData.forEach((s) => console.log(`Student:  ${s.email}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
