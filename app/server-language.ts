import { cookies, headers } from "next/headers";
import { LANGUAGE_COOKIE, resolveUiLanguage } from "./language";

export async function getRequestLanguage() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return resolveUiLanguage(
    cookieStore.get(LANGUAGE_COOKIE)?.value,
    requestHeaders.get("accept-language"),
  );
}
