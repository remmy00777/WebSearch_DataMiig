import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'demo@example.com';
  const password = process.env.ADMIN_PASSWORD || 'demo1234';
  const name = process.env.ADMIN_NAME || 'RCEG AI Administrator';

  const existing = await prisma.user.findUnique({
    where: { email }
  });

  if (existing) {
    console.log(`Administrator already exists: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12)
    }
  });

  console.log(`Administrator account created: ${email}`);
}

main()
  .catch((error) => {
    console.error('Database seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
