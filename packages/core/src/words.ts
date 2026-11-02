import { Paisa } from './money';

// Nepali cardinal numbers 0..99 (irregular, so a full table is required).
const NE_0_99 = (
  ' एक दुई तीन चार पाँच छ सात आठ नौ दश ' +
  'एघार बाह्र तेह्र चौध पन्ध्र सोह्र सत्र अठार उन्नाइस बीस ' +
  'एक्काइस बाइस तेइस चौबीस पच्चीस छब्बीस सत्ताइस अठ्ठाइस उनन्तीस तीस ' +
  'एकतीस बत्तीस तेत्तीस चौँतीस पैँतीस छत्तीस सैँतीस अठतीस उनन्चालीस चालीस ' +
  'एकचालीस बयालीस त्रिचालीस चवालीस पैँतालीस छयालीस सतचालीस अठचालीस उनन्चास पचास ' +
  'एकाउन्न बाउन्न त्रिपन्न चउन्न पचपन्न छपन्न सन्ताउन्न अन्ठाउन्न उनन्साठी साठी ' +
  'एकसट्ठी बयसट्ठी त्रिसट्ठी चौँसट्ठी पैँसट्ठी छयसट्ठी सतसट्ठी अठसट्ठी उनन्सत्तरी सत्तरी ' +
  'एकहत्तर बहत्तर त्रिहत्तर चौहत्तर पचहत्तर छयहत्तर सतहत्तर अठहत्तर उनासी असी ' +
  'एकासी बयासी त्रियासी चौरासी पचासी छयासी सतासी अठासी उनान्नब्बे नब्बे ' +
  'एकानब्बे बयानब्बे त्रियानब्बे चौरानब्बे पन्चानब्बे छयानब्बे सन्तानब्बे अन्ठानब्बे उनान्सय'
).split(' ');
if (NE_0_99.length !== 100) throw new Error('Nepali number table corrupt');

const EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function en0_99(n: number): string {
  if (n < 20) return EN_ONES[n];
  return EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : '');
}

// South-Asian scale: arab (10^9), crore (10^7), lakh (10^5), thousand (10^3), hundred (10^2).
const SCALES: [bigint, string, string][] = [
  [1_000_000_000n, 'अर्ब', 'Arab'],
  [10_000_000n, 'करोड', 'Crore'],
  [100_000n, 'लाख', 'Lakh'],
  [1_000n, 'हजार', 'Thousand'],
  [100n, 'सय', 'Hundred'],
];

function integerWords(n: bigint, lang: 'ne' | 'en'): string {
  if (n === 0n) return lang === 'ne' ? 'शून्य' : 'Zero';
  const parts: string[] = [];
  // Anything above 99 arab recurses (e.g. "एक सय अर्ब").
  const top = n / SCALES[0][0];
  if (top > 0n) {
    parts.push(`${top >= 100n ? integerWords(top, lang) : lang === 'ne' ? NE_0_99[Number(top)] : en0_99(Number(top))} ${lang === 'ne' ? SCALES[0][1] : SCALES[0][2]}`);
    n %= SCALES[0][0];
  }
  for (const [unit, ne, en] of SCALES.slice(1)) {
    const q = Number(n / unit);
    if (q > 0) parts.push(`${lang === 'ne' ? NE_0_99[q] : en0_99(q)} ${lang === 'ne' ? ne : en}`);
    n %= unit;
  }
  if (n > 0n) parts.push(lang === 'ne' ? NE_0_99[Number(n)] : en0_99(Number(n)));
  return parts.join(' ');
}

/** "रु. एक लाख पाँच हजार मात्र" / "Rupees One Lakh Five Thousand Only" */
export function amountInWords(p: Paisa, lang: 'ne' | 'en'): string {
  const neg = p < 0n;
  const a = neg ? -p : p;
  const rupees = a / 100n;
  const paisa = Number(a % 100n);
  const minus = neg ? (lang === 'ne' ? 'ऋण ' : 'Minus ') : '';
  if (lang === 'ne') {
    const ps = paisa ? ` र ${NE_0_99[paisa]} पैसा` : '';
    return `रु. ${minus}${integerWords(rupees, 'ne')}${ps} मात्र`;
  }
  const ps = paisa ? ` and Paisa ${en0_99(paisa)}` : '';
  return `Rupees ${minus}${integerWords(rupees, 'en')}${ps} Only`;
}
