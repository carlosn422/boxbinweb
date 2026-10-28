import { useEffect, useState } from 'react';

// On mobile, visualViewport shrinks when the software keyboard opens. Keep the
// composer inside that visible area instead of underneath the keyboard.
export function useCopilotViewport(open: boolean) {
  const [viewport, setViewport] = useState<{ height: number; top: number; mobile: boolean }>();
  useEffect(() => {
    if (!open) return;
    const view = window.visualViewport;
    const update = () => setViewport({ height: view?.height || window.innerHeight, top: view?.offsetTop || 0, mobile: window.innerWidth < 640 });
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
  return viewport?.mobile ? { height: viewport.height, top: viewport.top } : { height: 'calc(100dvh - 2rem)' };
}
