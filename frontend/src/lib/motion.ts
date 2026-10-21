import { useEffect, useState } from "react";

/** Tracks the user's `prefers-reduced-motion` setting.
 *
 *  Two things use it:
 *   - Chart animations are switched off entirely (recharts animates through
 *     requestAnimationFrame, which the CSS reduced-motion block cannot reach).
 *   - The CSS block also zeroes animation *delays*, so a staggered grid
 *     appears all at once instead of trickling in over ~300 ms.
 *
 *  The initial value is read synchronously during the first render so the
 *  very first paint already respects the preference — reading it in an
 *  effect would flash the animated state first. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}
