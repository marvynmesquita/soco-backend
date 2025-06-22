/*
  Warnings:

  - You are about to drop the column `dayType` on the `Line` table. All the data in the column will be lost.
  - Added the required column `dayType` to the `Schedule` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Line" DROP COLUMN "dayType";

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "dayType" "DayType" NOT NULL;
