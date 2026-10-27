"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/progress";

export type AmbienceMode = "off" | "stars" | "sakura" | "rain" | "fireflies";
export const AMBIENCE_MODES: { id: AmbienceMode; label: string; jp: string }[] = [
  { id: "off", label: "Off", jp: "無" },
  { id: "stars", label: "Stars", jp: "星" },
  { id: "sakura", label: "Sakura", jp: "桜" },
  { id: "rain", label: "Rain", jp: "雨" },
  { id: "fireflies", label: "Fireflies", jp: "蛍" },
];

type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; t: number; s: number };

function spawn(mode: AmbienceMode, w: number, h: number, anywhere: boolean): P {
  const x = Math.random() * w;
  const y = anywhere ? Math.random() * h : -20;
  const t = Math.random() * Math.PI * 2;
  switch (mode) {
    case "sakura":
      return { x, y, vx: 0.2 + Math.random() * 0.4, vy: 0.35 + Math.random() * 0.5, r: 3 + Math.random() * 3.5, a: 0.35 + Math.random() * 0.4, t, s: Math.random() * 0.02 };
    case "rain":
      return { x, y, vx: -0.6, vy: 7 + Math.random() * 5, r: 9 + Math.random() * 12, a: 0.08 + Math.random() * 0.12, t, s: 0 };
    case "fireflies":
      return { x, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: 1.4 + Math.random() * 1.6, a: 0, t, s: 0.01 + Math.random() * 0.02 };
    default:
      return { x, y: Math.random() * h, vx: 0, vy: 0.02 + Math.random() * 0.05, r: 0.4 + Math.random() * 1.1, a: 0.2 + Math.random() * 0.6, t, s: 0.005 + Math.random() * 0.02 };
  }
}

// A quiet, GPU-cheap particle layer behind the app. Pauses in background
// tabs; with reduced motion it draws one still frame (or nothing).
export function Ambience({ mode }: { mode: AmbienceMode }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || mode === "off") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let parts: P[] = [];
    let raf = 0;
    // Particles wear the member's color; re-read now and then so the color
    // slider recolors them live.
    let brand = "";
    let brand2 = "";
    let frame = 0;
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      brand = css.getPropertyValue("--brand").trim() || "hsl(351.4, 90%, 50%)";
      brand2 = css.getPropertyValue("--brand-2").trim() || brand;
    };
    readColors();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = mode === "rain" ? 9000 : mode === "stars" ? 9000 : 22000;
      const count = Math.min(Math.round((w * h) / density), mode === "rain" ? 110 : 90);
      parts = Array.from({ length: count }, () => spawn(mode, w, h, true));
    };

    const draw = (p: P) => {
      if (mode === "sakura") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.t);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = brand2;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (mode === "rain") {
        ctx.globalAlpha = p.a;
        ctx.strokeStyle = brand2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 1.5, p.y + p.r);
        ctx.stroke();
      } else if (mode === "fireflies") {
        const glow = (Math.sin(p.t) + 1) / 2;
        ctx.globalAlpha = 0.15 + glow * 0.7;
        ctx.fillStyle = brand;
        ctx.shadowColor = brand;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(p.t));
        ctx.fillStyle = p.r > 1.2 ? brand2 : "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      if (++frame % 30 === 0) readColors();
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.t += p.s || 0.01;
        if (mode === "sakura") {
          p.x += p.vx + Math.sin(p.t) * 0.4;
          p.y += p.vy;
        } else if (mode === "fireflies") {
          p.vx += (Math.random() - 0.5) * 0.04;
          p.vy += (Math.random() - 0.5) * 0.04;
          p.vx = Math.max(-0.5, Math.min(0.5, p.vx));
          p.vy = Math.max(-0.5, Math.min(0.5, p.vy));
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        } else {
          p.x += p.vx;
          p.y += p.vy;
        }
        if (p.y > h + 30 || p.x > w + 30) parts[i] = spawn(mode, w, h, mode === "stars");
        draw(p);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    };

    resize();
    if (reduced) {
      if (mode === "stars") {
        parts.forEach(draw);
        ctx.globalAlpha = 1;
      }
    } else {
      raf = requestAnimationFrame(step);
    }
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!reduced && document.visibilityState === "visible") raf = requestAnimationFrame(step);
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      ctx.clearRect(0, 0, w, h);
    };
  }, [mode]);

  if (mode === "off") return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0" aria-hidden />;
}
