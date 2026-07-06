import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@example.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { console.log('Demo user already exists.'); return; }
  await prisma.user.create({
    data: { email, name: 'Demo User', passwordHash: await bcrypt.hash('demo1234', 10) }
  });
  console.log('Seeded demo user: demo@example.com / demo1234');
}

main().finally(() => prisma.$disconnect());
