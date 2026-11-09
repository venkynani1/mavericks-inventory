-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'HANDED', 'REJECTED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "fusionSeenAt" TIMESTAMP(3),
ADD COLUMN     "fusionStatus" TEXT,
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "lastWorkingDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "claimOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "claimQty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "claimStockItemId" TEXT,
ADD COLUMN     "claimToken" TEXT;

-- CreateTable
CREATE TABLE "FusionImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "active" INTEGER NOT NULL DEFAULT 0,
    "resigned" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "reactivated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FusionImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVoucherLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'Amazon',
    "denomination" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "EventVoucherLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventClaim" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "empIdEntered" TEXT NOT NULL,
    "nameEntered" TEXT NOT NULL,
    "nameMatches" BOOLEAN NOT NULL DEFAULT true,
    "stockItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FusionImport_createdAt_idx" ON "FusionImport"("createdAt");

-- CreateIndex
CREATE INDEX "EventVoucherLine_requestId_idx" ON "EventVoucherLine"("requestId");

-- CreateIndex
CREATE INDEX "EventClaim_eventId_status_idx" ON "EventClaim"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventClaim_employeeId_idx" ON "EventClaim"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EventClaim_eventId_employeeId_key" ON "EventClaim"("eventId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_claimToken_key" ON "Event"("claimToken");

-- AddForeignKey
ALTER TABLE "EventVoucherLine" ADD CONSTRAINT "EventVoucherLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventClaim" ADD CONSTRAINT "EventClaim_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventClaim" ADD CONSTRAINT "EventClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventClaim" ADD CONSTRAINT "EventClaim_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

