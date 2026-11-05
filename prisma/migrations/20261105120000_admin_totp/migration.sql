ALTER TABLE "AdminLoginChallenge" ALTER COLUMN "codeHash" DROP NOT NULL;

CREATE TABLE "AdminTotpCredential" (
    "subjectKey" VARCHAR(64) NOT NULL,
    "accountId" UUID,
    "secret" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "setupTokenHash" CHAR(64),
    "setupExpiresAt" TIMESTAMP(3),
    "lastUsedCounter" BIGINT NOT NULL DEFAULT -1,
    "recoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminTotpCredential_pkey" PRIMARY KEY ("subjectKey"),
    CONSTRAINT "AdminTotpCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AdminTotpCredential_accountId_key" ON "AdminTotpCredential"("accountId");
CREATE UNIQUE INDEX "AdminTotpCredential_setupTokenHash_key" ON "AdminTotpCredential"("setupTokenHash");
CREATE INDEX "AdminTotpCredential_setupExpiresAt_idx" ON "AdminTotpCredential"("setupExpiresAt");
