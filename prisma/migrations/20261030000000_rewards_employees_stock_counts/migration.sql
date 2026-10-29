-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('TECH', 'NON_TECH', 'WORKSHOP', 'HACKATHON', 'CODEATHON', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PointsType" AS ENUM ('EVENT', 'ADJUSTMENT', 'RESET', 'REVERSAL');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('DUE', 'IN_PROGRESS', 'ISSUED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "RequestType" ADD VALUE 'STOCK_COUNT';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';

-- AlterTable
ALTER TABLE "DistributionLine" ADD COLUMN     "rewardId" TEXT;

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "adjustedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "points" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "organizer" TEXT,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsTransaction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "PointsType" NOT NULL,
    "points" INTEGER NOT NULL,
    "requested" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "eventId" TEXT,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardMilestone" (
    "id" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stockItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEarned" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'DUE',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMP(3),
    "requestId" TEXT,
    "note" TEXT,

    CONSTRAINT "RewardEarned_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCountLine_stockItemId_idx" ON "StockCountLine"("stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_requestId_stockItemId_key" ON "StockCountLine"("requestId", "stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_empId_key" ON "Employee"("empId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_points_idx" ON "Employee"("points");

-- CreateIndex
CREATE INDEX "Employee_name_idx" ON "Employee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_name_key" ON "EventType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_eventId_employeeId_key" ON "Attendance"("eventId", "employeeId");

-- CreateIndex
CREATE INDEX "PointsTransaction_employeeId_createdAt_idx" ON "PointsTransaction"("employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardMilestone_threshold_key" ON "RewardMilestone"("threshold");

-- CreateIndex
CREATE INDEX "RewardEarned_status_idx" ON "RewardEarned"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RewardEarned_employeeId_threshold_cycle_key" ON "RewardEarned"("employeeId", "threshold", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionLine_rewardId_key" ON "DistributionLine"("rewardId");

-- CreateIndex
CREATE INDEX "DistributionLine_distributedOn_idx" ON "DistributionLine"("distributedOn");

-- CreateIndex
CREATE INDEX "LedgerEntry_createdAt_idx" ON "LedgerEntry"("createdAt");

-- CreateIndex
CREATE INDEX "Request_createdAt_idx" ON "Request"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionLine" ADD CONSTRAINT "DistributionLine_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "RewardEarned"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardMilestone" ADD CONSTRAINT "RewardMilestone_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEarned" ADD CONSTRAINT "RewardEarned_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

