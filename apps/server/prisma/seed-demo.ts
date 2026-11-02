import { PrismaClient } from '@prisma/client';
import { seedOrganization } from '../src/seed/seed';

/**
 * DEMO data for trying the software (never for production): users admin/lekha/auditor,
 * the client's opening balance and a few appropriations in आन्तरिक चालु for FY 2082/83.
 */
(async () => {
  const prisma = new PrismaClient();
  // On a public/cloud deployment the passwords come from environment variables (set in the host's dashboard);
  // the well-known defaults are only for a demo on your own PC. Used only when the users are first created.
  const org = await seedOrganization(prisma, {
    orgCode: 'PATHIBHARA',
    users: [
      { username: 'admin', password: process.env.DEMO_ADMIN_PASSWORD || 'Admin12345', fullName: 'कार्यालय प्रमुख', post: 'प्रमुख', role: 'SUPER_ADMIN' },
      { username: 'lekha', password: process.env.DEMO_LEKHA_PASSWORD || 'Lekha12345', fullName: 'लेखापाल', post: 'लेखापाल', role: 'ACCOUNTANT' },
      { username: 'auditor', password: process.env.DEMO_AUDITOR_PASSWORD || 'Audit12345', fullName: 'लेखापरीक्षक', post: 'लेखापरीक्षक', role: 'AUDITOR' },
    ],
  });
  const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { orgId: org.id, code: '2082/83' } });
  const fund = await prisma.fund.findFirstOrThrow({ where: { orgId: org.id, source: 'INTERNAL', nature: 'RECURRENT' } });
  const admin = await prisma.user.findFirstOrThrow({ where: { orgId: org.id, role: 'SUPER_ADMIN' } });
  const bank = await prisma.ledgerAccount.findFirstOrThrow({ where: { orgId: org.id, kind: 'BANK' } });
  if (!(await prisma.openingBalance.count({ where: { fiscalYearId: fy.id } }))) {
    await prisma.openingBalance.create({ data: { fiscalYearId: fy.id, fundId: fund.id, accountId: bank.id, dateBs: fy.startBs, amount: 5030903873n } });
    await prisma.ledgerAccount.update({ where: { id: bank.id }, data: { bankName: 'नेपाल बैंक लि.', bankBranch: 'फुङलिङ', accountNo: '00000000000' } });
    const budgets: [string, bigint][] = [
      ['परामर्श सेवा', 100000000n],
      ['सेवा करार/ज्यालादारी शुल्क', 180000000n],
      ['कार्यालय संचालन', 350000000n],
      ['पर्व मेला महोत्सव', 50000000n],
      ['सूचना प्रविधि व्यवस्थापन', 60000000n],
    ];
    for (const [name, amount] of budgets) {
      const head = await prisma.ledgerAccount.findFirstOrThrow({ where: { orgId: org.id, nameNe: name } });
      await prisma.budgetEntry.create({ data: { fiscalYearId: fy.id, fundId: fund.id, accountId: head.id, type: 'APPROPRIATION', amount, note: 'DEMO', createdById: admin.id } });
    }
    await prisma.payee.createMany({
      data: [
        { orgId: org.id, name: 'हिमालय कन्सल्ट प्रा.लि.', pan: '601234567', vatRegistered: true, bankName: 'नेपाल बैंक', accountNo: '0100100200300', payeeType: 'FIRM' },
        { orgId: org.id, name: 'ताप्लेजुङ सप्लायर्स', pan: '301234568', bankName: 'राष्ट्रिय वाणिज्य बैंक', accountNo: '2200300400', payeeType: 'FIRM' },
        { orgId: org.id, name: 'राम बहादुर लिम्बु', pan: '112233445', bankName: 'कृषि विकास बैंक', accountNo: '5500660077', payeeType: 'INDIVIDUAL' },
      ],
    });
    await prisma.voucherCounter.create({ data: { fundId: fund.id, fiscalYearId: fy.id, nextNumber: 160 } });
  }
  console.log('Demo data ready (FY 2082/83, आन्तरिक चालु). Logins: admin/Admin12345, lekha/Lekha12345, auditor/Audit12345');
  await prisma.$disconnect();
})();
