CREATE TABLE "ProductGroup" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductGroup_name_key" ON "ProductGroup"("name");

INSERT INTO "ProductGroup" ("name")
SELECT DISTINCT "category" FROM "Product"
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ProductGroup" ("name")
VALUES ('Lanches'), ('Hambúrgueres'), ('Pizzas'), ('Saudável'), ('Doces'), ('Bebidas'), ('Complementos'), ('Acompanhamentos'), ('Molhos')
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_category_fkey"
FOREIGN KEY ("category") REFERENCES "ProductGroup"("name")
ON DELETE RESTRICT ON UPDATE CASCADE;