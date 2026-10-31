import { useEffect, useState } from 'react';

// Track the visible viewport on phones AND tablets when the keyboard or browser
// chrome changes. CSS owns the safe-area insets and desktop drawer margins.
export function useCopilotViewport(open: boolean) {
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  useEffect(() => {
    if (!open) return;
    const view = window.visualViewport;
    const update = () => setViewport({ height: view?.height || window.innerHeight, top: view?.offsetTop || 0 });
    update();
    view?.addEventListener('resize', update);
    view?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      view?.removeEventListener('resize', update);
      view?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [open]);
  return {
    height: `calc(${viewport ? `${viewport.height}px` : '100dvh'} - var(--copilot-inset-top) - var(--copilot-inset-bottom))`,
    top: `calc(${viewport?.top || 0}px + var(--copilot-inset-top))`,
  };
}
