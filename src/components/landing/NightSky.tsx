"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/progress";

type Star = { x: number; y: number; r: number; a: number; t: number; s: number };
type Petal = { x: number; y: number; r: number; vx: number; vy: number; rot: number; vr: number; a: number };
type Meteor = { x: number; y: number; vx: number; vy: number; life: number };

// Hero background: twinkling stars, drifting petals in the brand color,
// occasional shooting stars, and a glow that follows the pointer.
export function NightSky() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let petals: Petal[] = [];
    const meteors: Meteor[] = [];
    let raf = 0;
    let frame = 0;
    let brand = "hsl(351.4, 90%, 50%)";
    let brand2 = "hsl(351.4, 100%, 60%)";
    const mouse = { x: 0.5, y: 0.35, tx: 0.5, ty: 0.35 };

    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      brand = css.getPropertyValue("--brand").trim() || brand;
      brand2 = css.getPropertyValue("--brand-2").trim() || brand2;
    };
    const petal = (anywhere: boolean): Petal => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -20,
      r: 3 + Math.random() * 4,
      vx: 0.2 + Math.random() * 0.5,
      vy: 0.4 + Math.random() * 0.7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.04,
      a: 0.25 + Math.random() * 0.45,
    });
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.min(Math.round((w * h) / 4500), 260) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.2,
        a: Math.random() * 0.7 + 0.2,
        t: Math.random() * Math.PI * 2,
        s: 0.01 + Math.random() * 0.03,
      }));
      petals = Array.from({ length: Math.min(Math.round(w / 40), 36) }, () => petal(true));
    };

    const draw = () => {
      frame++;
      if (frame % 40 === 0) readColors();
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      ctx.clearRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(mouse.x * w, mouse.y * h, 0, mouse.x * w, mouse.y * h, Math.max(w, h) * 0.55);
      glow.addColorStop(0, brand.replace("hsl(", "hsla(").replace(")", ", 0.22)"));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        s.t += s.s;
        ctx.globalAlpha = s.a * (0.5 + 0.5 * Math.sin(s.t));
        ctx.fillStyle = s.r > 1.2 ? brand2 : "#fff";
        ctx.beginPath();
        ctx.arc(s.x + (mouse.x - 0.5) * s.r * 14, s.y + (mouse.y - 0.5) * s.r * 10, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        p.x += p.vx + Math.sin(frame * 0.01 + i) * 0.3;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > h + 20 || p.x > w + 20) petals[i] = petal(false);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = brand2;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (Math.random() < 0.006 && meteors.length < 2) {
        meteors.push({ x: Math.random() * w * 0.8, y: Math.random() * h * 0.4, vx: 7 + Math.random() * 4, vy: 2.5 + Math.random() * 2, life: 1 });
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.018;
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 12, m.y - m.vy * 12);
        grad.addColorStop(0, `rgba(255,255,255,${m.life})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 12, m.y - m.vy * 12);
        ctx.stroke();
        if (m.life <= 0) meteors.splice(i, 1);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      mouse.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!reduced && document.visibilityState === "visible") raf = requestAnimationFrame(draw);
    };

    readColors();
    resize();
    if (reduced) {
      for (const s of stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      raf = requestAnimationFrame(draw);
    }
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
