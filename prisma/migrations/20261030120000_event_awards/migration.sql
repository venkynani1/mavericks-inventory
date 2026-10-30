-- CreateEnum
CREATE TYPE "PrizeKind" AS ENUM ('GOODIE', 'VOUCHER', 'OTHER');

-- CreateEnum
CREATE TYPE "AwardStatus" AS ENUM ('PENDING', 'IN_APPROVAL', 'ISSUED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PointsType" ADD VALUE 'AWARD';

-- AlterTable
ALTER TABLE "DistributionLine" ADD COLUMN     "awardId" TEXT;

-- CreateTable
CREATE TABLE "AwardPosition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAward" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "kind" "PrizeKind" NOT NULL,
    "stockItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "voucherProvider" TEXT,
    "voucherAmount" INTEGER,
    "voucherRef" TEXT,
    "description" TEXT,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "status" "AwardStatus" NOT NULL DEFAULT 'PENDING',
    "requestId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardPosition_name_key" ON "AwardPosition"("name");

-- CreateIndex
CREATE INDEX "EventAward_eventId_idx" ON "EventAward"("eventId");

-- CreateIndex
CREATE INDEX "EventAward_employeeId_idx" ON "EventAward"("employeeId");

-- CreateIndex
CREATE INDEX "EventAward_status_idx" ON "EventAward"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionLine_awardId_key" ON "DistributionLine"("awardId");

-- AddForeignKey
ALTER TABLE "DistributionLine" ADD CONSTRAINT "DistributionLine_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "EventAward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAward" ADD CONSTRAINT "EventAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAward" ADD CONSTRAINT "EventAward_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAward" ADD CONSTRAINT "EventAward_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

