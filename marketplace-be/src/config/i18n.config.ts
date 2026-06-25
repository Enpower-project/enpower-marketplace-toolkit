export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Español',
} as const;

export function isValidLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

export function getValidLanguage(lang?: string): SupportedLanguage {
  if (!lang) return DEFAULT_LANGUAGE;

  // Extract primary language code (e.g., 'en' from 'en-US')
  const primaryLang = lang.split('-')[0].toLowerCase();

  return isValidLanguage(primaryLang) ? primaryLang : DEFAULT_LANGUAGE;
}