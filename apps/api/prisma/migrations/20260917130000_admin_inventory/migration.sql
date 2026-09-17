-- Add inventory alert configuration and immutable stock-movement history.
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'CORRECTION', 'DAMAGE', 'RETURN_RESTOCK', 'OTHER');

ALTER TABLE "Inventory"
ADD COLUMN "reorderLevel" INTEGER NOT NULL DEFAULT 5;

CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "onHandBefore" INTEGER NOT NULL,
    "onHandAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "reference" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryMovement_inventoryId_createdAt_idx"
ON "InventoryMovement"("inventoryId", "createdAt");

CREATE INDEX "InventoryMovement_createdAt_idx"
ON "InventoryMovement"("createdAt");

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_inventoryId_fkey"
FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
