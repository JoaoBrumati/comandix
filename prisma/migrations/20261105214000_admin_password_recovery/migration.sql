CREATE TABLE "AdminOwnerCredential" (
    "id" VARCHAR(16) NOT NULL DEFAULT 'owner',
    "loginName" VARCHAR(100) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOwnerCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminOwnerCredential_loginName_key" ON "AdminOwnerCredential"("loginName");

CREATE TABLE "AdminPasswordReset" (
    "tokenHash" CHAR(64) NOT NULL,
    "accountId" UUID,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPasswordReset_pkey" PRIMARY KEY ("tokenHash"),
    CONSTRAINT "AdminPasswordReset_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AdminPasswordReset_expiresAt_idx" ON "AdminPasswordReset"("expiresAt");
CREATE INDEX "AdminPasswordReset_accountId_idx" ON "AdminPasswordReset"("accountId");
