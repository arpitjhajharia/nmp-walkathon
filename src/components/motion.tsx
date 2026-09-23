"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Counts a number up to its real value when it scrolls into view, so the day's step total
 * reads as a tally rather than a static label.
 *
 * The server renders the final value, so the number is right without JavaScript. A figure
 * that is already on screen when this mounts is left alone: rewriting it to zero after the
 * browser has painted it would flicker. The animation writes to the DOM node directly
 * rather than through React state, so a rising count never re-renders the tree.
 */
export function CountUp({ value, duration = 1100 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    const format = (n: number) => Math.round(n).toLocaleString("en-US");
    el.textContent = format(0);

    let raf = 0;
    let startedAt = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const step = (now: number) => {
          startedAt ||= now;
          const p = Math.min(1, (now - startedAt) / duration);
          el.textContent = format(value * (1 - (1 - p) ** 3));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = format(value);
    };
  }, [value, duration]);

  return <span ref={ref}>{Math.round(value).toLocaleString("en-US")}</span>;
}
