import { PrismaClient, Role } from '@prisma/client';
import { fiscalYearFromStart } from '@pa/core';
import { hashPassword } from '../auth/auth.service';
import { adDate } from '../master/fiscal';

/**
 * Expense heads from the client's FY 2082/83 हिसाब विवरण.
 * PROVISIONAL economic codes / activity numbers — the Super Admin must verify them against the
 * office's approved budget book (बजेट किताब) before go-live; they are editable until first used.
 */
export const SEED_HEADS: { code: string; act: string; ne: string; en: string; nature: 'CAPITAL' | 'RECURRENT' }[] = [
  { code: '22411', act: '1', ne: 'परामर्श सेवा', en: 'Consultancy services', nature: 'RECURRENT' },
  { code: '22413', act: '1', ne: 'सेवा करार/ज्यालादारी शुल्क', en: 'Service contract / daily wages', nature: 'RECURRENT' },
  { code: '22711', act: '1', ne: 'अतिथि सत्कार', en: 'Guest hospitality', nature: 'RECURRENT' },
  { code: '22721', act: '1', ne: 'बैठक भत्ता खाजा', en: 'Meeting allowance & refreshments', nature: 'RECURRENT' },
  { code: '31122', act: '1', ne: 'फर्निचर मेसिनरी औजार खरिद', en: 'Furniture, machinery & tools purchase', nature: 'CAPITAL' },
  { code: '22212', act: '1', ne: 'यातायात कार्यालय प्रयोजन', en: 'Transport (office use)', nature: 'RECURRENT' },
  { code: '22311', act: '1', ne: 'कार्यालय संचालन', en: 'Office operation', nature: 'RECURRENT' },
  { code: '22221', act: '1', ne: 'मेसिनरी औजार मर्मत', en: 'Machinery & tools repair', nature: 'RECURRENT' },
  { code: '22522', act: '1', ne: 'पाथीभरा सँगीत/रेडियो कार्यक्रम', en: 'Pathibhara music / radio programme', nature: 'RECURRENT' },
  { code: '22522', act: '2', ne: 'पाथीभरा परिचय पुस्तक प्रकाशन', en: 'Pathibhara introduction book publication', nature: 'RECURRENT' },
  { code: '22522', act: '3', ne: 'सुरक्षाकर्मी खाजा खर्च', en: 'Security personnel refreshments', nature: 'RECURRENT' },
  { code: '22522', act: '4', ne: 'ज्याला/ढुवानी/भेटी व्यवस्थापन', en: 'Wages / transport / offerings management', nature: 'RECURRENT' },
  { code: '22522', act: '5', ne: 'औषधी खरिद', en: 'Medicine purchase', nature: 'RECURRENT' },
  { code: '22412', act: '1', ne: 'सूचना प्रविधि व्यवस्थापन', en: 'IT management', nature: 'RECURRENT' },
  { code: '22522', act: '6', ne: 'पर्व मेला महोत्सव', en: 'Festival & fair', nature: 'RECURRENT' },
  { code: '22522', act: '7', ne: 'सार्वजनिक सुनुवाइ कार्यक्रम', en: 'Public hearing programme', nature: 'RECURRENT' },
  { code: '22411', act: '2', ne: 'गुरुयोजना अध्ययन तथा पुनरावलोकन', en: 'Master plan study & review', nature: 'RECURRENT' },
  { code: '22522', act: '8', ne: 'पाथीभरा मन्दिर पर्व पूजा', en: 'Pathibhara temple festival worship', nature: 'RECURRENT' },
  { code: '22315', act: '1', ne: 'अनलाइन पत्रपत्रिका', en: 'Online news media', nature: 'RECURRENT' },
  { code: '22412', act: '2', ne: 'सूचना प्रविधि तथा साइबर', en: 'IT & cyber', nature: 'RECURRENT' },
  { code: '22522', act: '9', ne: 'होटल तथा यातायातको तथ्याङ्क', en: 'Hotel & transport statistics', nature: 'RECURRENT' },
  { code: '22411', act: '3', ne: 'भौतिक परियोजना प्रस्ताव लेखन', en: 'Physical project proposal writing', nature: 'RECURRENT' },
  { code: '22612', act: '1', ne: 'अध्ययन अवलोकन भ्रमण', en: 'Study / observation tour', nature: 'RECURRENT' },

  // Additional heads under the standard economic classification (आर्थिक संकेत तथा वर्गीकरण).
  // Also PROVISIONAL: verify each code against the office's रातो किताब before go-live.
  // ── पूँजीगत (capital) ──
  { code: '31111', act: '1', ne: 'विश्राम स्थल (धर्मशाला) भवन निर्माण', en: 'Rest house (dharmashala) construction', nature: 'CAPITAL' },
  { code: '31111', act: '2', ne: 'सार्वजनिक शौचालय निर्माण', en: 'Public toilet construction', nature: 'CAPITAL' },
  { code: '31111', act: '3', ne: 'कार्यालय भवन निर्माण', en: 'Office building construction', nature: 'CAPITAL' },
  { code: '31121', act: '1', ne: 'सवारी साधन खरिद', en: 'Vehicle purchase', nature: 'CAPITAL' },
  { code: '31122', act: '2', ne: 'सीसीटीभी तथा सुरक्षा उपकरण जडान', en: 'CCTV & security equipment', nature: 'CAPITAL' },
  { code: '31122', act: '3', ne: 'सोलार तथा बत्ती जडान', en: 'Solar & lighting installation', nature: 'CAPITAL' },
  { code: '31131', act: '1', ne: 'कम्प्युटर सफ्टवेयर निर्माण तथा खरिद', en: 'Computer software development & purchase', nature: 'CAPITAL' },
  { code: '31151', act: '1', ne: 'पदमार्ग तथा सिँढी निर्माण', en: 'Trail & stairway construction', nature: 'CAPITAL' },
  { code: '31151', act: '2', ne: 'सडक तथा पुल निर्माण', en: 'Road & bridge construction', nature: 'CAPITAL' },
  { code: '31159', act: '1', ne: 'खानेपानी संरचना निर्माण', en: 'Drinking-water structures', nature: 'CAPITAL' },
  { code: '31159', act: '2', ne: 'मन्दिर क्षेत्र संरक्षण तथा सौन्दर्यीकरण', en: 'Temple area conservation & beautification', nature: 'CAPITAL' },
  { code: '31159', act: '3', ne: 'फोहोरमैला व्यवस्थापन संरचना निर्माण', en: 'Waste-management structures', nature: 'CAPITAL' },
  { code: '31411', act: '1', ne: 'जग्गा प्राप्ति', en: 'Land acquisition', nature: 'CAPITAL' },
  // ── चालु (recurrent) ──
  { code: '21111', act: '1', ne: 'पारिश्रमिक कर्मचारी', en: 'Staff salaries', nature: 'RECURRENT' },
  { code: '21119', act: '1', ne: 'अन्य भत्ता', en: 'Other allowances', nature: 'RECURRENT' },
  { code: '22111', act: '1', ne: 'पानी तथा बिजुली', en: 'Water & electricity', nature: 'RECURRENT' },
  { code: '22112', act: '1', ne: 'सञ्चार महसुल', en: 'Communication charges', nature: 'RECURRENT' },
  { code: '22213', act: '1', ne: 'सवारी साधन मर्मत', en: 'Vehicle repair', nature: 'RECURRENT' },
  { code: '22214', act: '1', ne: 'बीमा तथा नवीकरण', en: 'Insurance & renewal', nature: 'RECURRENT' },
  { code: '22231', act: '1', ne: 'निर्मित सार्वजनिक सम्पत्तिको मर्मत सम्भार', en: 'Repair of public assets', nature: 'RECURRENT' },
  { code: '22311', act: '2', ne: 'मसलन्द तथा कार्यालय सामग्री', en: 'Stationery & office supplies', nature: 'RECURRENT' },
  { code: '22522', act: '10', ne: 'सरसफाई तथा फोहोरमैला व्यवस्थापन', en: 'Sanitation & waste management', nature: 'RECURRENT' },
  { code: '22522', act: '11', ne: 'तीर्थयात्री सहायता तथा उद्धार', en: 'Pilgrim assistance & rescue', nature: 'RECURRENT' },
  { code: '22611', act: '1', ne: 'अनुगमन, मूल्याङ्कन खर्च', en: 'Monitoring & evaluation', nature: 'RECURRENT' },
  { code: '22711', act: '2', ne: 'विविध खर्च', en: 'Miscellaneous', nature: 'RECURRENT' },
];

/** Default TDS rules — MUST be verified by a Chartered Accountant against the current Finance Act. */
export const SEED_TAX_RULES = [
  { code: 'VAT_SUPPLIER', nameNe: 'मू.अ.कर दर्ता आपूर्तिकर्ता/सेवा (मू.अ.कर बाहेकको रकममा)', nameEn: 'VAT-registered supplier/service (on amount excl. VAT)', rateBp: 150, excludeVat: true },
  { code: 'NON_VAT_FIRM', nameNe: 'मू.अ.कर दर्ता नभएको फर्मको बिल', nameEn: 'Non-VAT bill (registered firm)', rateBp: 150, excludeVat: false },
  { code: 'INDIVIDUAL_SERVICE', nameNe: 'मू.अ.कर दर्ता नभएका व्यक्तिलाई सेवा/परामर्श शुल्क', nameEn: 'Service/consultancy fee to non-VAT individual', rateBp: 1500, excludeVat: false },
  { code: 'SALARY_SST', nameNe: 'तलब/ज्याला सामाजिक सुरक्षा कर', nameEn: 'Salary / wages social security tax', rateBp: 100, excludeVat: false },
  { code: 'RENT', nameNe: 'घर/सवारी भाडा', nameEn: 'House / vehicle rent', rateBp: 1000, excludeVat: false },
  { code: 'EXEMPT', nameNe: 'कर छुट (कारण अनिवार्य)', nameEn: 'Exempt (reason required)', rateBp: 0, excludeVat: false },
];

export interface SeedOptions {
  orgCode?: string;
  fiscalYearStart?: number;
  users?: { username: string; password: string; fullName: string; post: string; role: Role }[];
}

/** Creates one organisation with its 4 funds, chart of accounts, tax rules, fiscal year and users. Idempotent per orgCode. */
export async function seedOrganization(prisma: PrismaClient, opts: SeedOptions = {}) {
  const code = opts.orgCode ?? 'PATHIBHARA';
  const existing = await prisma.organization.findUnique({ where: { code } });
  if (existing) return existing;

  const org = await prisma.organization.create({
    data: {
      code,
      nameNe: 'पाथीभरा क्षेत्र विकास समिति',
      nameEn: 'Pathibhara Area Development Committee',
      govLevelNe: 'प्रदेश सरकार',
      govLevelEn: 'Provincial Government',
      ministryNe: '',
      ministryEn: '',
      addressNe: 'ताप्लेजुङ',
      addressEn: 'Taplejung',
      districtNe: 'ताप्लेजुङ',
      districtEn: 'Taplejung',
    },
  });

  const fyInfo = fiscalYearFromStart(opts.fiscalYearStart ?? 2082);
  await prisma.fiscalYear.create({
    data: { orgId: org.id, code: fyInfo.code, startYear: fyInfo.startYear, startBs: fyInfo.startBs, endBs: fyInfo.endBs, startAd: adDate(fyInfo.startBs), endAd: adDate(fyInfo.endBs) },
  });

  const funds: [('INTERNAL' | 'GRANT'), ('CAPITAL' | 'RECURRENT'), string, string][] = [
    ['INTERNAL', 'CAPITAL', 'आन्तरिक - पूँजीगत खर्च', 'Internal - Capital expenditure'],
    ['INTERNAL', 'RECURRENT', 'आन्तरिक - चालु खर्च', 'Internal - Recurrent expenditure'],
    ['GRANT', 'CAPITAL', 'अनुदान - पूँजीगत खर्च', 'Grant - Capital expenditure'],
    ['GRANT', 'RECURRENT', 'अनुदान - चालु खर्च', 'Grant - Recurrent expenditure'],
  ];
  for (const [source, nature, nameNe, nameEn] of funds) await prisma.fund.create({ data: { orgId: org.id, source, nature, nameNe, nameEn } });

  await prisma.ledgerAccount.createMany({
    data: [
      { orgId: org.id, kind: 'BANK', code: 'BANK-1', nameNe: 'बैंक खाता', nameEn: 'Bank account', bankName: '', accountNo: '', sortOrder: 1 },
      { orgId: org.id, kind: 'CASH', code: 'CASH-1', nameNe: 'नगद', nameEn: 'Cash in hand', sortOrder: 2 },
      { orgId: org.id, kind: 'TDS_PAYABLE', code: 'TDS', nameNe: 'अग्रिम कर कट्टी दायित्व', nameEn: 'TDS payable', sortOrder: 3 },
      { orgId: org.id, kind: 'ADVANCE', code: 'ADV', nameNe: 'पेस्की', nameEn: 'Advance', sortOrder: 4 },
      ...SEED_HEADS.map((h, i) => ({ orgId: org.id, kind: 'EXPENSE' as const, code: h.code, activityNo: h.act, nameNe: h.ne, nameEn: h.en, nature: h.nature, folioNo: String(i + 1), sortOrder: i + 1 })),
    ],
  });

  const eff = fyInfo.startBs;
  await prisma.taxRule.createMany({ data: SEED_TAX_RULES.map((r) => ({ ...r, orgId: org.id, effectiveFromBs: eff, effectiveFromAd: adDate(eff) })) });

  for (const u of opts.users ?? []) {
    await prisma.user.create({ data: { orgId: org.id, username: u.username, passwordHash: await hashPassword(u.password), fullName: u.fullName, post: u.post, role: u.role } });
  }
  return org;
}
