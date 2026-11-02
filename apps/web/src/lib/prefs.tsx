import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNepali, parseAmount, toDevanagariDigits } from '@pa/core';
import { patch } from './api';

/** Per-user display preferences: language, Devanagari digits, theme. Remembered in the browser; language also on the server. */
interface Prefs {
  lang: 'ne' | 'en';
  setLang: (l: 'ne' | 'en', persist?: boolean) => void;
  devanagari: boolean;
  setDevanagari: (v: boolean) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
}
const Ctx = createContext<Prefs>(null as unknown as Prefs);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [lang, setLangState] = useState<'ne' | 'en'>(i18n.language === 'en' ? 'en' : 'ne');
  const [devanagari, setDevState] = useState(read('pa.dev') === '1');
  const [dark, setDarkState] = useState(read('pa.theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: 'ne' | 'en', persist = true) => {
    setLangState(l);
    i18n.changeLanguage(l);
    write('pa.lang', l);
    if (persist) patch('/auth/me/language', { language: l }).catch(() => {});
  };
  return (
    <Ctx.Provider
      value={{
        lang,
        setLang,
        devanagari,
        setDevanagari: (v) => (setDevState(v), write('pa.dev', v ? '1' : '0')),
        dark,
        setDark: (v) => (setDarkState(v), write('pa.theme', v ? 'dark' : 'light')),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const usePrefs = () => useContext(Ctx);

/** Formatting helpers bound to the user's digit preference. Money strings come from the API ("78050.00"). */
export function useFmt() {
  const { devanagari, lang } = usePrefs();
  const digits = (s: string | number) => (devanagari ? toDevanagariDigits(String(s)) : String(s));
  return {
    lang,
    digits,
    paisa: (p: bigint) => formatNepali(p, { devanagari }),
    money: (m: string | null | undefined) => (m == null || m === '' ? '' : formatNepali(parseAmount(m), { devanagari })),
    /** Bilingual pick of a {nameNe, nameEn} record. */
    name: (o: { nameNe: string; nameEn: string } | null | undefined) => (o ? (lang === 'ne' ? o.nameNe : o.nameEn) : ''),
  };
}
