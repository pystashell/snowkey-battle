export type MobileKeyboardMode = "system" | "compact";
export type CompactKeyboardRow = Readonly<{
  letters: readonly string[];
  leadingKey?: "shift";
  trailingKey?: "clear";
}>;

export const MOBILE_KEYBOARD_MEDIA_QUERY =
  "(max-width: 560px), (max-width: 1120px) and (max-height: 600px)";
export const MOBILE_KEYBOARD_STORAGE_KEY = "snowkey-battle:mobile-keyboard";
export const COMPACT_KEYBOARD_LAYOUT: readonly CompactKeyboardRow[] = [
  {
    letters: ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  },
  {
    letters: ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  },
  {
    letters: ["z", "x", "c", "v", "b", "n", "m"],
    leadingKey: "shift",
    trailingKey: "clear",
  },
] as const;

export function resolveMobileKeyboardMode(
  storedMode: string | null,
  mobileKeyboardAvailable: boolean,
): MobileKeyboardMode {
  if (storedMode === "system" || storedMode === "compact") return storedMode;
  return mobileKeyboardAvailable ? "compact" : "system";
}
