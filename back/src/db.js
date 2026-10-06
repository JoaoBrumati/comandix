const { PrismaClient } = require('@prisma/client');

const prisma = globalThis.__comandixPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__comandixPrisma = prisma;

module.exports = prisma;
