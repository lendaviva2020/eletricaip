// In-memory detector and logger for missing translation keys (Dev / Test / Audit)

const missingKeys = new Set<string>();

export function recordMissingKey(key: string, locale: string): void {
  const entry = `[${locale}] ${key}`;
  missingKeys.add(entry);
  if (process.env.NODE_ENV === "development") {
    console.warn(`[i18n] Chave de tradução ausente: ${entry}`);
  }
}

export function getMissingKeys(): string[] {
  return Array.from(missingKeys);
}

export function clearMissingKeys(): void {
  missingKeys.clear();
}

export function hasMissingKeys(): boolean {
  return missingKeys.size > 0;
}
