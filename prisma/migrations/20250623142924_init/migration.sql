-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('SEMANA', 'SABADO', 'DOMINGO');

-- CreateTable
CREATE TABLE "Line" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "polyline" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "notes" TEXT,
    "dayType" "DayType" NOT NULL,
    "lineId" TEXT NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "neighborhood" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StopOnRoute" (
    "lineId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "StopOnRoute_pkey" PRIMARY KEY ("lineId","stopId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Line_number_key" ON "Line"("number");

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopOnRoute" ADD CONSTRAINT "StopOnRoute_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopOnRoute" ADD CONSTRAINT "StopOnRoute_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
