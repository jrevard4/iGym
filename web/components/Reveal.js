'use client';

import { useEffect, useRef, useState } from 'react';

// Fades + slides children into view the first time they scroll into the
// viewport. No animation library — a single IntersectionObserver per
// instance, disconnected after it fires once. Honors prefers-reduced-motion
// by rendering fully visible immediately (no motion at all, not even a
// faster version of it — that's still motion for a vestibular-disorder
// reader).
export default function Reveal({ children, className = '', as: Tag = 'div', delayMs = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSkipAnimation(true);
      setVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={
        (skipAnimation ? '' : 'transition-all duration-700 ease-out ') +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8') +
        ' ' + className
      }
      style={visible && delayMs ? {} : { transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </Tag>
  );
}
