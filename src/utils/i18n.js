// =====================================================
// i18n — Static Translation Utility (No AI Translation)
// =====================================================
import en from '../i18n/en.json';
import hi from '../i18n/hi.json';
import mr from '../i18n/mr.json';

const translations = { en, hi, mr };

let currentLang = localStorage.getItem('ghk_lang') || 'hi';

export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('ghk_lang', lang);
}

export function getLang() {
  return currentLang;
}

export function t(key) {
  return translations[currentLang]?.[key] || translations.en?.[key] || key;
}

export const LANGS = [
  { code: 'hi', label: 'हिंदी' },
  { code: 'mr', label: 'मराठी' },
  { code: 'en', label: 'English' },
];
