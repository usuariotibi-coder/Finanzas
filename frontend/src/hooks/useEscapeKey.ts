import { useEffect } from 'react';

type EscapeHandler = () => void;

export default function useEscapeKey(onEscape: EscapeHandler, isActive: boolean = true) {
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, isActive]);
}
