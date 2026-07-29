-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_droppedBy_fkey";

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_droppedBy_fkey" FOREIGN KEY ("droppedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
