"use client";

import { useEffect, useRef } from "react";

type Dot = {
  angle: number;
  radius: number;
  orbitSpeed: number;
  size: number;
  stretch: number;
  seed: number;
  hue: number;
};

export default function ShieldScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    mount.appendChild(canvas);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let maxRadius = 0;
    let frameId = 0;

    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      active: 0,
      targetActive: 0,
    };

    const dots: Dot[] = [];

    const buildDots = () => {
      dots.length = 0;
      const dotCount = Math.max(
        260,
        Math.min(900, Math.floor((width * height) / 2200))
      );

      for (let i = 0; i < dotCount; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const ringDepth = 0.22 + Math.pow(Math.random(), 0.85) * 0.82;
        dots.push({
          angle,
          radius: ringDepth * maxRadius * (0.88 + Math.random() * 0.28),
          orbitSpeed: 0.00008 + Math.random() * 0.00018,
          size: 0.65 + Math.random() * 1.35,
          stretch: 1.1 + Math.random() * 1.2,
          seed: Math.random() * 5000,
          hue: 132 + Math.random() * 80,
        });
      }
    };

    const resize = () => {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      maxRadius = Math.min(width, height) * 0.7;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      pointer.x = width * 0.5;
      pointer.y = height * 0.5;
      pointer.targetX = pointer.x;
      pointer.targetY = pointer.y;

      buildDots();
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!inside) {
        pointer.targetActive = 0;
        return;
      }

      pointer.targetX = e.clientX - rect.left;
      pointer.targetY = e.clientY - rect.top;
      pointer.targetActive = 1;
    };
    const onPointerLeave = () => {
      pointer.targetActive = 0;
    };

    const animate = (now: number) => {
      frameId = window.requestAnimationFrame(animate);

      pointer.x += (pointer.targetX - pointer.x) * 0.11;
      pointer.y += (pointer.targetY - pointer.y) * 0.11;
      pointer.active += (pointer.targetActive - pointer.active) * 0.08;

      ctx.clearRect(0, 0, width, height);

      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const influenceRadius = Math.min(width, height) * 0.38;

      for (let i = 0; i < dots.length; i += 1) {
        const dot = dots[i];
        const t = now * dot.orbitSpeed + dot.seed;

        const orbitX = Math.cos(dot.angle + t) * dot.radius * 1.08;
        const orbitY = Math.sin(dot.angle + t) * dot.radius * 0.82;
        const wobbleX = Math.sin(now * 0.00042 + dot.seed) * 5;
        const wobbleY = Math.cos(now * 0.00036 + dot.seed * 1.3) * 4;
        const baseX = centerX + orbitX + wobbleX;
        const baseY = centerY + orbitY + wobbleY;

        const dx = pointer.x - baseX;
        const dy = pointer.y - baseY;
        const dist = Math.hypot(dx, dy) || 1;
        const normalized = Math.max(0, 1 - dist / influenceRadius) * pointer.active;

        const pull = normalized * 32;
        const swirl = normalized * 16;
        const nx = dx / dist;
        const ny = dy / dist;

        const x = baseX + nx * pull + -ny * swirl;
        const y = baseY + ny * pull + nx * swirl;

        const hue =
          dot.hue +
          normalized * 64 +
          Math.sin(now * 0.0009 + dot.seed * 0.8) * 10;
        const saturation = 52 + normalized * 35;
        const lightness = 36 + normalized * 28;
        const alpha = 0.12 + normalized * 0.72;
        const rotation = dot.angle + now * dot.orbitSpeed * 0.7 + normalized * 1.1;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(dot.stretch + normalized * 0.8, 1);
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, dot.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (pointer.targetActive < 0.01) {
        pointer.targetX += (centerX - pointer.targetX) * 0.025;
        pointer.targetY += (centerY - pointer.targetY) * 0.025;
      }
    };

    resize();
    frameId = window.requestAnimationFrame(animate);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      if (mount.contains(canvas)) {
        mount.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}
