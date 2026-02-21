import { useState, useEffect } from 'react';

const DEFAULT_PLACEHOLDER = 'Describe a task and let AI handle the rest';
const TYPING_SPEED = 40;

interface UseTypingPlaceholderOptions {
  typingSpeed?: number;
  enabled?: boolean;
  text?: string;
}

export function useTypingPlaceholder({
  typingSpeed = TYPING_SPEED,
  enabled = true,
  text = DEFAULT_PLACEHOLDER,
}: UseTypingPlaceholderOptions = {}): string {
  const [charCount, setCharCount] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset typing state when source text changes
    setCharCount(0);

    setCompleted(false);
  }, [text]);

  useEffect(() => {
    if (!enabled || completed) return;

    const id = setTimeout(
      () => {
        setCharCount((prev) => {
          const next = prev + 1;
          if (next >= text.length) {
            setCompleted(true);
          }
          return next;
        });
      },
      charCount === 0 ? 400 : typingSpeed,
    );

    return () => clearTimeout(id);
  }, [enabled, charCount, typingSpeed, completed, text]);

  if (completed || (!enabled && charCount > 0)) {
    return text;
  }

  return text.slice(0, charCount);
}
