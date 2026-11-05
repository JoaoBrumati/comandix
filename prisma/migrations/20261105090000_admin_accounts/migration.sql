CREATE TABLE "AdminAccount" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "loginName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(160) NOT NULL,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAccount_email_key" ON "AdminAccount"("email");
CREATE UNIQUE INDEX "AdminAccount_loginName_key" ON "AdminAccount"("loginName");
CREATE INDEX "AdminAccount_createdAt_idx" ON "AdminAccount"("createdAt");

ALTER TABLE "AdminSession" ADD COLUMN "accountId" UUID;
CREATE INDEX "AdminSession_accountId_idx" ON "AdminSession"("accountId");
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdminLoginChallenge" (
    "tokenHash" CHAR(64) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "accountId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginChallenge_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "AdminLoginChallenge_expiresAt_idx" ON "AdminLoginChallenge"("expiresAt");
CREATE INDEX "AdminLoginChallenge_accountId_idx" ON "AdminLoginChallenge"("accountId");
ALTER TABLE "AdminLoginChallenge" ADD CONSTRAINT "AdminLoginChallenge_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
