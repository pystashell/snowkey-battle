"use client";

import { useRef, useState, type InputHTMLAttributes, type Ref } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onKeyDown"> & {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onValueChange: (value: string) => void;
  onClear: () => void;
  clearOnBackspace: boolean;
};

export function EnglishTypingInput({ value, onValueChange, onClear, clearOnBackspace, ...props }: Props) {
  const composing = useRef(false);
  const committed = useRef<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  return <input
    {...props}
    value={draft ?? value}
    onChange={(event) => {
      const next = event.currentTarget.value;
      if (composing.current || (event.nativeEvent as InputEvent).isComposing) {
        setDraft(next);
        return;
      }
      const duplicateCommit = committed.current === next;
      committed.current = null;
      if (!duplicateCommit) onValueChange(next);
    }}
    onCompositionStart={() => { composing.current = true; committed.current = null; setDraft(value); }}
    onCompositionEnd={(event) => {
      composing.current = false;
      const next = event.currentTarget.value;
      committed.current = next;
      setDraft(null);
      onValueChange(next);
    }}
    onKeyDown={(event) => {
      if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      committed.current = null;
      if (event.key === "Escape" || event.key === " " || (clearOnBackspace && event.key === "Backspace")) {
        event.preventDefault();
        onClear();
      }
      // Letters come from the text input event, including system/mobile keyboards.
    }}
  />;
}
