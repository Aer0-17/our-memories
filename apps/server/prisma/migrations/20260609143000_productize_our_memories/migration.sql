-- CreateEnum
CREATE TYPE "MemoryVisibility" AS ENUM ('both', 'me', 'her');

-- CreateEnum
CREATE TYPE "ActivationCodeStatus" AS ENUM ('active', 'used', 'revoked');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'fulfilled', 'canceled');

-- CreateEnum
CREATE TYPE "OrderProvider" AS ENUM ('manual', 'wechat', 'app_store');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "wechatOpenId" TEXT;

-- AlterTable
ALTER TABLE "Memory"
ADD COLUMN "title" TEXT,
ADD COLUMN "mood" TEXT,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "visibility" "MemoryVisibility" NOT NULL DEFAULT 'both',
ADD COLUMN "partnerNote" TEXT,
ADD COLUMN "placeName" TEXT;

-- CreateTable
CREATE TABLE "AnniversaryCard" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "coverPhotoId" TEXT,
    "repeatYearly" BOOLEAN NOT NULL DEFAULT true,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnniversaryCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnniversaryPhoto" (
    "id" TEXT NOT NULL,
    "anniversaryCardId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnniversaryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "ActivationCodeStatus" NOT NULL DEFAULT 'active',
    "plan" "SpacePlan" NOT NULL DEFAULT 'private',
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedBySpaceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "provider" "OrderProvider" NOT NULL DEFAULT 'manual',
    "providerOrderId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "plan" "SpacePlan" NOT NULL DEFAULT 'private',
    "activationCodeId" TEXT,
    "spaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_wechatOpenId_key" ON "User"("wechatOpenId");

-- CreateIndex
CREATE INDEX "Memory_spaceId_visibility_idx" ON "Memory"("spaceId", "visibility");

-- CreateIndex
CREATE INDEX "AnniversaryCard_spaceId_pinned_sortOrder_idx" ON "AnniversaryCard"("spaceId", "pinned", "sortOrder");

-- CreateIndex
CREATE INDEX "AnniversaryCard_spaceId_date_idx" ON "AnniversaryCard"("spaceId", "date");

-- CreateIndex
CREATE INDEX "AnniversaryPhoto_anniversaryCardId_idx" ON "AnniversaryPhoto"("anniversaryCardId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationCode_codeHash_key" ON "ActivationCode"("codeHash");

-- CreateIndex
CREATE INDEX "ActivationCode_status_idx" ON "ActivationCode"("status");

-- CreateIndex
CREATE INDEX "ActivationCode_usedBySpaceId_idx" ON "ActivationCode"("usedBySpaceId");

-- CreateIndex
CREATE INDEX "Order_provider_providerOrderId_idx" ON "Order"("provider", "providerOrderId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_spaceId_idx" ON "Order"("spaceId");

-- AddForeignKey
ALTER TABLE "AnniversaryCard" ADD CONSTRAINT "AnniversaryCard_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnniversaryCard" ADD CONSTRAINT "AnniversaryCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnniversaryPhoto" ADD CONSTRAINT "AnniversaryPhoto_anniversaryCardId_fkey" FOREIGN KEY ("anniversaryCardId") REFERENCES "AnniversaryCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_usedBySpaceId_fkey" FOREIGN KEY ("usedBySpaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;
