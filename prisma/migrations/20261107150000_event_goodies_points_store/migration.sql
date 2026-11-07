-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PLACED', 'ACCEPTED', 'COLLECTED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'REDEMPTION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PointsType" ADD VALUE 'REDEMPTION';
ALTER TYPE "PointsType" ADD VALUE 'REFUND';

-- AlterTable
ALTER TABLE "EventAward" ADD COLUMN     "fromAllocation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "eventId" TEXT;

-- CreateTable
CREATE TABLE "RewardCatalogItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stockItemId" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PLACED',
    "totalPoints" INTEGER NOT NULL,
    "placedById" TEXT NOT NULL,
    "note" TEXT,
    "pickupLocation" TEXT,
    "pickupAt" TIMESTAMP(3),
    "pickupNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "collectedAt" TIMESTAMP(3),
    "collectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedemptionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "RedemptionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardCatalogItem_active_pointsCost_idx" ON "RewardCatalogItem"("active", "pointsCost");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionOrder_number_key" ON "RedemptionOrder"("number");

-- CreateIndex
CREATE INDEX "RedemptionOrder_status_createdAt_idx" ON "RedemptionOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RedemptionOrder_employeeId_idx" ON "RedemptionOrder"("employeeId");

-- CreateIndex
CREATE INDEX "RedemptionLine_orderId_idx" ON "RedemptionLine"("orderId");

-- CreateIndex
CREATE INDEX "RedemptionLine_stockItemId_idx" ON "RedemptionLine"("stockItemId");

-- CreateIndex
CREATE INDEX "Request_eventId_idx" ON "Request"("eventId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardCatalogItem" ADD CONSTRAINT "RewardCatalogItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionOrder" ADD CONSTRAINT "RedemptionOrder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionLine" ADD CONSTRAINT "RedemptionLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RedemptionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionLine" ADD CONSTRAINT "RedemptionLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "RewardCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionLine" ADD CONSTRAINT "RedemptionLine_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

