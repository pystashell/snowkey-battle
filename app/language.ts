export type UiLanguage = "zh" | "en";

export const LANGUAGE_COOKIE = "snow_battle_language";

export function resolveUiLanguage(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): UiLanguage {
  if (cookieValue === "zh" || cookieValue === "en") return cookieValue;
  const primaryLanguage = acceptLanguage?.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  return primaryLanguage.startsWith("zh") ? "zh" : "en";
}

export function localize(language: UiLanguage, chinese: string, english: string) {
  return language === "zh" ? chinese : english;
}
