"use client";
import { useEffect, useState } from "react";

// Número que "sobe" de 0 até ao valor final quando a página abre (respeita prefers-reduced-motion).
const fmt = (n: number, kind: "int" | "compact") =>
  kind === "compact"
    ? n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n))
    : String(Math.round(n));

export default function CountUp({ to, kind = "int", duration = 1500, delay = 250 }: { to: number; kind?: "int" | "compact"; duration?: number; delay?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setV(to));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now() + delay;
    const tick = () => {
      const p = Math.min(1, Math.max(0, (performance.now() - t0) / duration));
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, delay]);
  return <span aria-label={fmt(to, kind)}>{fmt(v, kind)}</span>;
}
