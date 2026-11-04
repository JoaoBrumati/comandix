CREATE TABLE "AdminSession" (
    "tokenHash" CHAR(64) NOT NULL,
    "csrfToken" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
