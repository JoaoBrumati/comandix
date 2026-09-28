-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AddonGroup" AS ENUM ('drinks', 'sides', 'sauces');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('new', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "cpfHash" CHAR(64) NOT NULL,
    "privateData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacation" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "start" DATE NOT NULL,
    "end" DATE NOT NULL,
    "note" VARCHAR(160) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalDocument" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "mimeType" VARCHAR(80) NOT NULL,
    "size" INTEGER NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "image" VARCHAR(240) NOT NULL,
    "rating" VARCHAR(10) NOT NULL DEFAULT '5.0',
    "tag" VARCHAR(40) NOT NULL DEFAULT 'Do cardápio',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Addon" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "group" "AddonGroup" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "Addon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "productId" INTEGER NOT NULL,
    "percentage" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'new',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "paymentMethod" VARCHAR(20) NOT NULL,
    "paymentStatus" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "paymentData" TEXT,
    "customerData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "addons" TEXT[],
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_cpfHash_key" ON "Employee"("cpfHash");
CREATE INDEX "Employee_createdAt_idx" ON "Employee"("createdAt");
CREATE INDEX "Vacation_employeeId_start_idx" ON "Vacation"("employeeId", "start");
CREATE INDEX "TimeEntry_employeeId_timestamp_idx" ON "TimeEntry"("employeeId", "timestamp");
CREATE INDEX "TimeEntry_timestamp_idx" ON "TimeEntry"("timestamp");
CREATE INDEX "MedicalDocument_employeeId_uploadedAt_idx" ON "MedicalDocument"("employeeId", "uploadedAt");
CREATE INDEX "Product_active_category_idx" ON "Product"("active", "category");
CREATE UNIQUE INDEX "Addon_name_key" ON "Addon"("name");
CREATE INDEX "Addon_group_idx" ON "Addon"("group");
CREATE INDEX "Promotion_productId_startsAt_endsAt_idx" ON "Promotion"("productId", "startsAt", "endsAt");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
