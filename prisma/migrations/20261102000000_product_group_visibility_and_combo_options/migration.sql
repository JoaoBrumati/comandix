ALTER TABLE "ProductGroup"
ADD COLUMN "visibleInStorefront" BOOLEAN NOT NULL DEFAULT true;

UPDATE "ProductGroup"
SET "visibleInStorefront" = false
WHERE "name" IN ('Complementos', 'Acompanhamentos', 'Molhos');

ALTER TABLE "Product"
ADD COLUMN "optionGroupName" VARCHAR(50),
ADD COLUMN "maxOptionSelections" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_optionGroupName_fkey"
FOREIGN KEY ("optionGroupName") REFERENCES "ProductGroup"("name")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
ADD COLUMN "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
