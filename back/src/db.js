const { PrismaClient } = require('@prisma/client');

const prisma = globalThis.__anotaaiPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__anotaaiPrisma = prisma;

module.exports = prisma;
