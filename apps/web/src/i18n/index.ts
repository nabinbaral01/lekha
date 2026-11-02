import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ne from './ne';
import en from './en';

const saved = (() => {
  try {
    return localStorage.getItem('pa.lang');
  } catch {
    return null;
  }
})();

i18n.use(initReactI18next).init({
  resources: { ne: { translation: ne }, en: { translation: en } },
  lng: saved === 'en' ? 'en' : 'ne',
  fallbackLng: 'ne',
  interpolation: { escapeValue: false },
});

export default i18n;
