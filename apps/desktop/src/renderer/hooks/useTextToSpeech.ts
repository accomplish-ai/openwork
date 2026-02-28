import { useEffect, useRef, useState } from 'react';
import type { Message } from '../components/chat/types';

interface UseTextToSpeechOptions {
  messages: Message[];
  isLoadingRef: React.RefObject<boolean>;
}

/**
 * Speaks new assistant messages aloud using the Web Speech Synthesis API.
 * Only speaks a given message once, and only while the task is loading
 * (i.e. streaming). Exposes `speakRepliesEnabled` state.
 */
export function useTextToSpeech({ messages, isLoadingRef }: UseTextToSpeechOptions) {
  const [speakRepliesEnabled] = useState(true);
  const spokenAssistantMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    if (!speakRepliesEnabled) {
      window.speechSynthesis.cancel();
      return;
    }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== 'assistant') {
      return;
    }

    if (spokenAssistantMessageIdsRef.current.has(latestMessage.id)) {
      return;
    }

    if (!isLoadingRef.current) {
      return;
    }

    const text = latestMessage.content.trim();
    if (!text) {
      return;
    }

    spokenAssistantMessageIdsRef.current.add(latestMessage.id);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [messages, speakRepliesEnabled, isLoadingRef]);

  return { speakRepliesEnabled };
}
