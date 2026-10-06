'use client';
import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { formatCredits } from '@/lib/format';

/** Smoothly tweens between integer values (balance updates, payouts). */
export function AnimatedNumber({ value, duration = 0.6, format = (n: number) => formatCredits(n), className }: { value: number; duration?: number; format?: (n: number) => string; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || prev.current === value) {
      prev.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);
  return <span className={className}>{format(display)}</span>;
}
