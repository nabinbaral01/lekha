import { ReactNode } from 'react';
import { parseAmount, toDevanagariDigits, todayBs } from '@pa/core';
import { useFmt } from '../lib/prefs';
import { useSession } from '../lib/session';
import type { Money } from '../lib/types';

export interface F203Line {
  side: 'DR' | 'CR';
  amount: Money;
  activityNo: string;
  componentNo: string;
  src1Agency: string;
  src1Method: string;
  src2Agency: string;
  src2Method: string;
  account: { code: string; nameNe: string; nameEn: string; folioNo: string; kind: string };
}
export interface F203Payee {
  sn: number;
  name: string;
  pan: string;
  bankName: string;
  accountNo: string;
  net: Money;
  eftRef: string;
}
interface Signer {
  fullName?: string;
  post?: string;
  at?: string | null;
}
export interface F203Data {
  type: string;
  number: number | null;
  status?: string;
  dateBs: string;
  eftRef: string;
  projectName: string;
  budgetSubHead?: { code: string; nameNe: string; nameEn: string } | null;
  narration: string;
  lines: F203Line[];
  payees: F203Payee[];
  totals: { debit: Money; credit: Money };
  wordsNe: string;
  wordsEn: string;
  signatures?: { prepared?: Signer | null; submitted?: Signer | null; approved?: Signer | null };
}

/** Official text of the printed form (म.ले.प. फाराम नं. २०३), reproduced word for word. */
const PURPOSE =
  'विनियोजनलाई प्रारम्भिक अभिलेख गर्ने उद्देश्यले यो फाराम तयार गरिन्छ। विनियोजनको पेस्की लेखांकन, हिसाब मिलान, अन्य समायोजन गर्नको लागि समेत यो फाराम तयार गरिन्छ।';
const HOW_TO_FILL = [
  'बजेट उपशीर्षक नम्बरमा व्यय अनुमानको विवरण (रातो किताब) अनुसार बजेट उपशीर्षक नम्बर लेख्नुपर्दछ।',
  'आयोजना/कार्यक्रमको नाममा व्यय अनुमानको विवरण (रातो किताब) अनुसार कार्यक्रम/ आयोजनाको नाम लेख्नुपर्दछ।',
  'मितिमा भौचर उठाएको दिनको मिति लेख्नुपर्दछ।',
  'गोश्वारा भौचर नं. मा क्रमिक रूपमा १ नं. बाट शुरु गरी सिलसिलेबार हुने गरी भौचर नं. लेख्नुपर्दछ।',
  'महल १ मा कारोबारलाई डेबिट गर्नुपर्ने भए डेबिट र क्रेडिट गर्नुपर्ने भए क्रेडिट लेख्नुपर्छ।',
  'महल २ र ३ मा खर्च शीर्षकको संकेत नम्बर र नाम लेख्नुपर्छ।',
  'महल ४ मा क्रियाकलाप नम्बर र महल ५ मा कम्पोनेन्ट लेख्नुपर्छ।',
  'महल ६ मा खाता पाना नं. (Ledger Folio) लेख्नुपर्छ।',
  'महल ७, ८, ९ र १० मा सम्बन्धित सरकारको तहले बजेटको श्रोतमा कायम गरिएको श्रोतलाई प्राथमिक तह र अन्य तहको सरकारबाट प्राप्त अनुदान सम्बन्धमा अनुदान प्रदान गर्ने सरकारको बजेटको श्रोतमा कायम गरिएको श्रोतलाई द्वितीय तहको रुपमा कायम गर्नु पर्दछ। संघीय सरकारको हकमा प्राथमिक तह (महल ७ र ८)मा मात्र विवरण उल्लेख हुने र द्वितीय तह खालि रहने तर प्रदेश सरकार र स्थानीय तहको सरकारको हकमा आन्तरिक अनुदान (समानीकरण अनुदान, सशर्त अनुदान, समपुरक अनुदान र विशेष अनुदान)को श्रोत कायम गर्दा प्राथमिक तह र द्वितीय तह दुवै श्रोत कायम गर्नु पर्दछ। प्रदेश सरकार र स्थानीय तहको सरकारको हकमा आन्तरिक अनुदान (समानीकरण अनुदान, सशर्त अनुदान, समपुरक अनुदान र विशेष अनुदान) बाहेक अन्य स्रोतमा प्राथमिक तहमा मात्र स्रोत व्यहोर्ने निकाय र भुक्तानी विधि उल्लेख गर्नु पर्दछ तर द्वितीय तह खालि रहने छ। उदाहरणको लागि प्रदेश सरकारले संघीय सरकारबाट एडिबि सोधभर्ना हुने अनुदान श्रोत कायम भई प्राप्त भएको सशर्त अनुदानको गोश्वारा भौचर उठाउँदा प्राथमिक तह र द्वितीय तहमा स्रोत कायम गर्दा प्राथमिक तहमा स्रोत व्यहोर्ने निकाय - संघ र भुक्तानी विधि - सशर्त अनुदान उल्लेख हुने र द्वितीय तहमा स्रोत व्यहोर्ने निकाय - एडिबि र भुक्तानी विधि - सोधभर्ना हुने अनुदान उल्लेख गर्नु पर्दछ।',
  'महल ११ र १२ मा डेबिट वा क्रेडिट मध्ये के हो सम्बन्धित महलमा डेबिट वा क्रेडिट रकम लेख्नु पर्दछ।',
  'जम्मा हरफमा डेबिट तथा क्रेडिट गरिएको महलहरूको जोड जम्मा गर्नुपर्छ।',
  'जम्मा रकम अक्षरमा भन्ने हरफमा माथि जम्मा रकम अंकमा लेखिएकोलाई अक्षरमा लेख्नुपर्छ।',
  'कारोबारको संक्षिप्त ब्यहोरा भन्ने हरफमा माथि भौचर तयार गरिएको कारोबारको संक्षिप्त ब्यहोरा लेख्नुपर्छ।',
  'भौचर तयार गर्ने, पेस गर्ने र स्वीकृत गर्नेको हस्ताक्षर, नाम, पद र मिति उल्लेख गर्ने।',
];
const ATTACHMENTS =
  'भुक्तानी कारोबारको सिफारिस पत्र (म.ले.प.फाराम नं २०२, पेस्की माग फाराम मलेप फाराम २०२क) र कारोबार पुष्टि हुने लेखा निर्देशिकाले तोकेको अन्य कागजात संलग्न गरिएको छ।';

const MIN_LINE_ROWS = 5; // the paper form has 5 ruled rows
const MIN_PAYEE_ROWS = 2;
const N = toDevanagariDigits; // the form's own printed numbers are always Devanagari, like the paper

/** A blank of the paper form: the filled value on a dotted line, or just dots when empty. */
function Blank({ children, min = 'min-w-[6rem]' }: { children?: ReactNode; min?: string }) {
  const empty = children === undefined || children === null || children === '';
  return <span className={`inline-block border-b border-dotted border-fg/70 px-1 align-baseline ${min}`}>{empty ? ' ' : <b>{children}</b>}</span>;
}

/** One of the printed alternatives ("साधारण/समायोजन/फिर्ता समायोजन"); the one that applies is marked. */
const Opt = ({ on, children }: { on: boolean; children: ReactNode }) => (on ? <b className="underline decoration-2 underline-offset-2">{children}</b> : <span>{children}</span>);

/** म.ले.प. फाराम नं. २०३ गोश्वारा भौचर (विनियोजन) — a word-for-word copy of the printed government form. */
export function Form203({ v }: { v: F203Data }) {
  const { meta } = useSession();
  const { money, paisa, digits } = useFmt();
  const org = meta?.org;
  const level = org?.govLevelNe ?? '';
  const isFederal = level.includes('नेपाल');
  const isProvince = level.includes('प्रदेश');
  const isLocal = level.includes('स्थानीय');
  const sigDate = (s?: Signer | null) => (s?.at ? digits(todayBs(new Date(s.at))) : ''); // BS date, Nepal time
  const lineAmt = (l: F203Line, side: 'DR' | 'CR') => (l.side === side ? money(l.amount) : '');
  const payTotal = v.payees.reduce((s, p) => s + parseAmount(p.net), 0n);
  const blankLines = Math.max(0, MIN_LINE_ROWS - v.lines.length);
  const blankPayees = Math.max(0, MIN_PAYEE_ROWS - v.payees.length);

  return (
    <div lang="ne" className="print-sheet relative mx-auto max-w-[1100px] rounded-lg border border-border bg-surface p-6 text-[13px] leading-snug shadow-sm print:text-[10px]">
      {v.status === 'CANCELLED' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rotate-[-20deg] rounded border-4 border-danger px-6 py-2 text-5xl font-bold text-danger opacity-60">रद्द</span>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_2fr_1fr] items-start gap-2">
        <div className="w-fit border border-fg/70 px-3 py-2 text-center text-xs leading-relaxed">
          <Opt on={isFederal}>नेपाल सरकार/</Opt>
          <br />
          <Opt on={isProvince}>प्रदेश सरकार/</Opt>
          <br />
          <Opt on={isLocal}>स्थानीय तह</Opt>
        </div>
        <div className="space-y-1 text-center">
          <div className="font-semibold">
            <Opt on={isFederal}>संघ</Opt>/ <Opt on={isProvince}>प्रदेश</Opt> / <Opt on={isLocal}>स्थानीय तह</Opt>
          </div>
          <div>
            <Blank min="min-w-[8rem]">{org?.ministryNe || org?.nameNe}</Blank> मन्त्रालय/विभाग/कार्यालय
          </div>
          <div>
            कार्यालय कोड :<Blank>{org?.officeCode ? digits(org.officeCode) : ''}</Blank>
          </div>
          <div className="pt-2 text-base font-bold">गोश्वारा भौचर (विनियोजन)</div>
        </div>
        <div className="text-right text-xs">म.ले.प.फाराम नं: २०३</div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-1">
        <div className="space-y-1">
          <div>
            भौचरको प्रकार : <Opt on={v.type === 'NORMAL'}>साधारण</Opt>/<Opt on={v.type === 'ADJUSTMENT'}>समायोजन</Opt>/<Opt on={v.type === 'REVERSAL'}>फिर्ता समायोजन</Opt>
          </div>
          <div>
            बजेट उपशीर्षक नम्बर: <Blank min="min-w-[10rem]">{v.budgetSubHead ? `${digits(v.budgetSubHead.code)} ${v.budgetSubHead.nameNe}` : ''}</Blank>
          </div>
          <div>
            आयोजना/कार्यक्रमको नाम: <Blank min="min-w-[14rem]">{v.projectName}</Blank>
          </div>
        </div>
        <div className="space-y-1">
          <div>
            मिति :<Blank>{digits(v.dateBs)}</Blank>
          </div>
          <div>
            गो.भौ.नं.:<Blank>{v.number != null ? digits(v.number) : v.status && v.status !== 'APPROVED' ? '(स्वीकृत भएपछि)' : ''}</Blank>
          </div>
          <div>
            विद्युतीय कारोबार संकेत नं :<Blank>{digits(v.eftRef)}</Blank>
          </div>
        </div>
      </div>

      {/* ── Main 12-column table ───────────────────────────── */}
      <div className="mt-3 overflow-x-auto">
        <table className="form-table min-w-[900px]">
          <thead>
            <tr>
              <th rowSpan={3}>डे./क्रे.</th>
              <th colSpan={2}>खर्च शीर्षक</th>
              <th colSpan={2}>अन्य संकेत</th>
              <th rowSpan={3}>खाता पाना नं</th>
              <th colSpan={4}>स्रोत विवरण</th>
              <th rowSpan={3}>डेबिट रु.</th>
              <th rowSpan={3}>क्रेडिट रु.</th>
            </tr>
            <tr>
              <th rowSpan={2}>नम्बर</th>
              <th rowSpan={2} className="min-w-[170px]">
                नाम
              </th>
              <th rowSpan={2}>क्रियाकलाप नं.</th>
              <th rowSpan={2}>कम्पोनेन्ट नं.</th>
              <th colSpan={2}>प्राथमिक तह</th>
              <th colSpan={2}>द्वितीय तह</th>
            </tr>
            <tr>
              <th>स्रोत व्यहोर्ने निकाय</th>
              <th>भुक्तानी विधि</th>
              <th>स्रोत व्यहोर्ने निकाय</th>
              <th>भुक्तानी विधि</th>
            </tr>
            <tr>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} className="font-normal">
                  {N(String(i + 1))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l, i) => (
              <tr key={i}>
                <td className="text-center">{l.side === 'DR' ? 'डे.' : 'क्रे.'}</td>
                <td className="text-center">{digits(l.account.code)}</td>
                <td>{l.account.nameNe}</td>
                <td className="text-center">{digits(l.activityNo)}</td>
                <td className="text-center">{digits(l.componentNo)}</td>
                <td className="text-center">{digits(l.account.folioNo)}</td>
                <td>{l.src1Agency}</td>
                <td>{l.src1Method}</td>
                <td>{l.src2Agency}</td>
                <td>{l.src2Method}</td>
                <td className="num">{lineAmt(l, 'DR')}</td>
                <td className="num">{lineAmt(l, 'CR')}</td>
              </tr>
            ))}
            {Array.from({ length: blankLines }, (_, i) => (
              <tr key={`b${i}`}>
                {Array.from({ length: 12 }, (_, k) => (
                  <td key={k}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={10} className="text-center">
                जम्मा
              </td>
              <td className="num">{money(v.totals.debit)}</td>
              <td className="num">{money(v.totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2">
        जम्मा रकम अक्षरमा<Blank min="min-w-[28rem]">{v.wordsNe}</Blank> ।
      </div>

      <div className="mt-2 font-semibold underline">कारोबारको संक्षिप्त ब्यहोरा</div>
      <div className="mt-1">
        ( <Blank min="min-w-[28rem]">{v.narration.trim().replace(/[।.]+$/, '')}</Blank> । )
      </div>

      <p className="mt-2">{ATTACHMENTS}</p>

      {/* ── Payee table ────────────────────────────────────── */}
      <div className="mt-2 font-semibold">(भुक्तानी प्रयोजनका लागि)</div>
      <div className="overflow-x-auto">
        <table className="form-table min-w-[700px]">
          <thead>
            <tr>
              <th className="w-12">क्र.सं.</th>
              <th>भुक्तानी पाउनेको नाम</th>
              <th>स्थायी लेखा नं</th>
              <th>बैंकको नाम र शाखा</th>
              <th>बैंक खाता नं</th>
              <th>भुक्तानी रकम</th>
              <th>दस्तखत/विद्युतीय कारोबार नं.</th>
            </tr>
          </thead>
          <tbody>
            {v.payees.map((p) => (
              <tr key={p.sn}>
                <td className="text-center">{digits(p.sn)}</td>
                <td>{p.name}</td>
                <td className="text-center">{digits(p.pan)}</td>
                <td>{p.bankName}</td>
                <td>{digits(p.accountNo)}</td>
                <td className="num">{money(p.net)}</td>
                <td>{digits(p.eftRef)}</td>
              </tr>
            ))}
            {Array.from({ length: blankPayees }, (_, i) => (
              <tr key={`p${i}`}>
                {Array.from({ length: 7 }, (_, k) => (
                  <td key={k}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="text-center">
                जम्मा
              </td>
              <td className="num">{v.payees.length ? paisa(payTotal) : ''}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Signatures ─────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-3 gap-6 print:mt-4">
        {([
          ['prepared', 'तयार गर्ने'],
          ['submitted', 'पेस गर्ने'],
          ['approved', 'स्वीकृत गर्ने'],
        ] as const).map(([k, label], i) => {
          const s = v.signatures?.[k];
          return (
            <div key={k} className={i === 1 ? 'justify-self-center' : i === 2 ? 'justify-self-end' : ''}>
              <div className="space-y-1.5 print:space-y-1">
                <div>
                  {label} :<Blank min="min-w-[7rem]" />
                </div>
                <div>
                  नाम :<Blank min="min-w-[7rem]">{s?.fullName}</Blank>
                </div>
                <div>
                  पद :<Blank min="min-w-[7rem]">{s?.post}</Blank>
                </div>
                <div>
                  मिति :<Blank min="min-w-[7rem]">{sigDate(s)}</Blank>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Printed instructions (part of the official form) ── */}
      <div className="mt-6 text-[12px] leading-relaxed print:mt-3 print:text-[8px] print:leading-snug">
        <div className="font-semibold underline">उद्देश्य:</div>
        <p>{PURPOSE}</p>
        <div className="mt-2 font-semibold underline">फाराम भर्ने तरिका:</div>
        <ol className="mt-1 space-y-0.5 print:space-y-0">
          {HOW_TO_FILL.map((text, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 shrink-0 text-right">{N(String(i + 1))}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
