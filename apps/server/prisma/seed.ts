import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { seedOrganization } from '../src/seed/seed';

/**
 * Production seed: organisation, 4 funds, chart of accounts, tax rules, FY 2082/83 and a single
 * Super Admin. A random initial password is printed once — change it at first login.
 */
(async () => {
  const prisma = new PrismaClient();
  const password = process.env.SEED_ADMIN_PASSWORD ?? `Pa${randomBytes(6).toString('hex')}1`;
  const exists = await prisma.organization.findUnique({ where: { code: 'PATHIBHARA' } });
  await seedOrganization(prisma, { users: [{ username: 'admin', password, fullName: 'प्रमुख', post: 'कार्यालय प्रमुख', role: 'SUPER_ADMIN' }] });
  console.log(exists ? 'Organisation already seeded; nothing changed.' : `Seeded. Super Admin login: admin / ${password}  (change it immediately)`);
  await prisma.$disconnect();
})();
