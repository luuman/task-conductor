import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh.json";
import en from "./locales/en.json";

const LNG_KEY = "tc_language";

function getSavedLanguage(): string {
  try {
    return localStorage.getItem(LNG_KEY) || "zh";
  } catch {
    return "zh";
  }
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: getSavedLanguage(),
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

export function setLanguage(lng: string) {
  i18n.changeLanguage(lng);
  try {
    localStorage.setItem(LNG_KEY, lng);
  } catch {
    // ignore
  }
}

export function getLanguage(): string {
  return i18n.language || "zh";
}

export default i18n;
