import { useEffect, useRef } from "react";

export default function usePolling(callback, intervalMs = 15000, deps = []) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);

  useEffect(() => {
    let timer;
    let cancelled = false;
    const tick = async () => {
      try { await saved.current(); } catch (e) {}
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
