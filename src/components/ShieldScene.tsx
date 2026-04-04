"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ShieldScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let W = mount.clientWidth;
    let H = mount.clientHeight;

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    /* ── Scene & Camera ── */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
    camera.position.set(0, 0, 12);

    /* ── Mouse tracking ── */
    const mouse = { x: 0, y: 0 };
    const onMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.y = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouseMove);

    /* ════════════════════════════════════════
       DARK LEAF GREEN PALETTE
    ════════════════════════════════════════ */
    const leafColors = [
      new THREE.Color("#1a3a2a"),  // deep forest
      new THREE.Color("#1e4d32"),  // dark leaf
      new THREE.Color("#265e3a"),  // mid green
      new THREE.Color("#2d7a47"),  // bright leaf
      new THREE.Color("#1b5e3b"),  // emerald dark
    ];

    /* ════════════════════════════════════════
       FLOWING ORGANIC PARTICLES
    ════════════════════════════════════════ */
    const particleCount = 80;
    interface Particle {
      mesh: THREE.Mesh;
      vx: number;
      vy: number;
      baseX: number;
      baseY: number;
      phase: number;
      speed: number;
    }
    const particles: Particle[] = [];

    const particleMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.5,
    });

    for (let i = 0; i < particleCount; i++) {
      const size = 0.04 + Math.random() * 0.08;
      const geo = new THREE.CircleGeometry(size, 8);
      const mat = particleMat.clone();
      mat.color = leafColors[Math.floor(Math.random() * leafColors.length)].clone();
      mat.opacity = 0.15 + Math.random() * 0.35;

      const mesh = new THREE.Mesh(geo, mat);
      const x = (Math.random() - 0.5) * 26;
      const y = (Math.random() - 0.5) * 16;
      mesh.position.set(x, y, -2 + Math.random() * 2);

      scene.add(mesh);
      particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 0.003,
        vy: (Math.random() - 0.5) * 0.003,
        baseX: x,
        baseY: y,
        phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.5,
      });
    }

    /* ════════════════════════════════════════
       CONNECTING LINES (network web)
    ════════════════════════════════════════ */
    const lineGroup = new THREE.Group();
    scene.add(lineGroup);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color("#2d7a47"),
      transparent: true,
      opacity: 0.08,
    });

    const updateLines = () => {
      // Dispose old
      while (lineGroup.children.length > 0) {
        const child = lineGroup.children[0];
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
        }
        lineGroup.remove(child);
      }

      const maxDist = 3.8;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].mesh.position.x - particles[j].mesh.position.x;
          const dy = particles[i].mesh.position.y - particles[j].mesh.position.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxDist) {
            const alpha = (1 - d / maxDist) * 0.12;
            const geo = new THREE.BufferGeometry().setFromPoints([
              particles[i].mesh.position.clone(),
              particles[j].mesh.position.clone(),
            ]);
            const mat = lineMaterial.clone();
            mat.opacity = alpha;
            lineGroup.add(new THREE.Line(geo, mat));
          }
        }
      }
    };

    /* ════════════════════════════════════════
       LARGE SOFT GLOW ORBS (ambient atmosphere)
    ════════════════════════════════════════ */
    const createGlow = (x: number, y: number, radius: number, color: THREE.Color, opacity: number) => {
      const geo = new THREE.CircleGeometry(radius, 32);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, -5);
      scene.add(mesh);
      return mesh;
    };

    const glow1 = createGlow(-6, 3, 5, new THREE.Color("#1a3a2a"), 0.12);
    const glow2 = createGlow(7, -2, 4.5, new THREE.Color("#1e4d32"), 0.08);
    const glow3 = createGlow(0, 0, 6, new THREE.Color("#0d2018"), 0.1);

    /* ════════════════════════════════════════
       ANIMATION LOOP
    ════════════════════════════════════════ */
    let frameId: number;
    let lineTimer = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Particles drift in organic wave patterns
      particles.forEach((p) => {
        p.mesh.position.x = p.baseX + Math.sin(t * p.speed + p.phase) * 1.2 + mouse.x * 0.4;
        p.mesh.position.y = p.baseY + Math.cos(t * p.speed * 0.7 + p.phase) * 0.8 + mouse.y * 0.3;

        // Slow drift of base position
        p.baseX += p.vx;
        p.baseY += p.vy;

        // Wrap around edges
        if (p.baseX > 14) p.baseX = -14;
        if (p.baseX < -14) p.baseX = 14;
        if (p.baseY > 9) p.baseY = -9;
        if (p.baseY < -9) p.baseY = 9;
      });

      // Update lines every 4 frames (performance)
      lineTimer++;
      if (lineTimer % 4 === 0) updateLines();

      // Breathing glow orbs
      glow1.position.x = -6 + Math.sin(t * 0.15) * 1.5 + mouse.x * 0.8;
      glow1.position.y = 3 + Math.cos(t * 0.12) * 1 + mouse.y * 0.6;
      (glow1.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 0.3) * 0.04;

      glow2.position.x = 7 + Math.cos(t * 0.1) * 1.2 + mouse.x * 0.5;
      glow2.position.y = -2 + Math.sin(t * 0.18) * 0.8 + mouse.y * 0.4;
      (glow2.material as THREE.MeshBasicMaterial).opacity = 0.07 + Math.cos(t * 0.25) * 0.03;

      glow3.position.x = mouse.x * 1.2;
      glow3.position.y = mouse.y * 0.8;
      (glow3.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(t * 0.2) * 0.03;

      // Very subtle camera sway
      camera.position.x = mouse.x * 0.3;
      camera.position.y = mouse.y * 0.2;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    /* ── Resize ── */
    const onResize = () => {
      if (!mount) return;
      W = mount.clientWidth;
      H = mount.clientHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    };
    window.addEventListener("resize", onResize);

    /* ── Cleanup ── */
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
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
