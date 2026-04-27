import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  onComplete?: (value: string) => void;
}

const CHAR_REGEX = /^[A-Z0-9]$/;

const CodeInput = ({
  value,
  onChange,
  length = 6,
  invalid,
  autoFocus,
  onComplete,
}: CodeInputProps) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const writeAt = (idx: number, char: string) => {
    const chars = value.padEnd(length, " ").split("");
    chars[idx] = char;
    const next = chars.join("").replace(/ +$/g, "").slice(0, length);
    onChange(next);
    return next;
  };

  const handleChange = (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value.toUpperCase();
    if (raw === "") {
      writeAt(idx, " ");
      return;
    }
    const last = raw.slice(-1);
    if (!CHAR_REGEX.test(last)) return;
    const next = writeAt(idx, last);
    if (idx < length - 1) {
      refs.current[idx + 1]?.focus();
    }
    if (next.length === length && CHAR_REGEX.test(next[length - 1])) {
      onComplete?.(next);
    }
  };

  const handleKeyDown = (
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[idx]) {
        writeAt(idx, " ");
      } else if (idx > 0) {
        writeAt(idx - 1, " ");
        refs.current[idx - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (
    idx: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pasted = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!pasted) return;
    e.preventDefault();
    const chars = value.padEnd(length, " ").split("");
    for (let i = 0; i < pasted.length && idx + i < length; i += 1) {
      chars[idx + i] = pasted[i];
    }
    const next = chars.join("").replace(/ +$/g, "").slice(0, length);
    onChange(next);
    const focusIdx = Math.min(idx + pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
    if (next.length === length) onComplete?.(next);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {Array.from({ length }).map((_, idx) => {
        const char = value[idx] && value[idx] !== " " ? value[idx] : "";
        return (
          <input
            key={idx}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            value={char}
            onChange={(e) => handleChange(idx, e)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={(e) => handlePaste(idx, e)}
            onFocus={handleFocus}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={1}
            aria-label={`Code character ${idx + 1}`}
            className={cn(
              "h-12 w-10 rounded-lg border bg-background/50 text-center font-mono text-xl font-semibold uppercase text-foreground transition-colors sm:h-14 sm:w-12 sm:text-2xl",
              "focus:outline-none focus:ring-2",
              invalid
                ? "border-destructive/60 focus:border-destructive/60 focus:ring-destructive/30"
                : "border-white/10 focus:border-accent/60 focus:ring-accent/30",
            )}
          />
        );
      })}
    </div>
  );
};

export default CodeInput;
