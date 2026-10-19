import { PrismaClient } from "@prisma/client";

export const databaseEnabled = Boolean(process.env.DATABASE_URL);
export const prisma = new PrismaClient();

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
