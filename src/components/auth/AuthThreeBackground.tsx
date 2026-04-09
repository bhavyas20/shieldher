'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function AuthThreeBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
    camera.position.set(0, 0, 8.4);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    globeGroup.position.set(1.65, -0.2, -0.2);
    scene.add(globeGroup);

    const accentGroup = new THREE.Group();
    accentGroup.position.set(-2.35, 1.25, -1.3);
    scene.add(accentGroup);

    const starCount = 2600;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const colorA = new THREE.Color('#d7e2d2');
    const colorB = new THREE.Color('#f2efe2');
    const mixedColor = new THREE.Color();

    for (let i = 0; i < starCount; i += 1) {
      const i3 = i * 3;
      const radius = 1.85 + Math.random() * 2.35;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sinPhi = Math.sin(phi);

      starPositions[i3] = radius * sinPhi * Math.cos(theta);
      starPositions[i3 + 1] = radius * Math.cos(phi) * 0.84;
      starPositions[i3 + 2] = radius * sinPhi * Math.sin(theta);

      mixedColor.lerpColors(colorA, colorB, Math.random());
      starColors[i3] = mixedColor.r;
      starColors[i3 + 1] = mixedColor.g;
      starColors[i3 + 2] = mixedColor.b;
    }

    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starsMaterial = new THREE.PointsMaterial({
      size: 0.035,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    const stars = new THREE.Points(starsGeometry, starsMaterial);
    globeGroup.add(stars);

    const glowStarsMaterial = new THREE.PointsMaterial({
      size: 0.075,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    const glowStars = new THREE.Points(starsGeometry, glowStarsMaterial);
    globeGroup.add(glowStars);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.08, 5),
      new THREE.MeshPhysicalMaterial({
        color: '#8ea58f',
        transparent: true,
        opacity: 0.22,
        roughness: 0.26,
        metalness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      })
    );
    globeGroup.add(core);

    const aura = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.28, 3),
      new THREE.MeshBasicMaterial({
        color: '#e9eadb',
        transparent: true,
        opacity: 0.11,
        side: THREE.BackSide,
      })
    );
    globeGroup.add(aura);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.52, 3),
      new THREE.MeshBasicMaterial({
        color: '#d6dfc8',
        transparent: true,
        opacity: 0.2,
        wireframe: true,
      })
    );
    globeGroup.add(shell);

    const orbitRingMaterial = new THREE.MeshBasicMaterial({
      color: '#d9e4cd',
      transparent: true,
      opacity: 0.22,
    });
    const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.03, 16, 140), orbitRingMaterial);
    orbitRing.rotation.x = Math.PI / 2.7;
    globeGroup.add(orbitRing);

    const accentRingMaterial = new THREE.MeshBasicMaterial({
      color: '#dce7d3',
      transparent: true,
      opacity: 0.26,
    });
    const accentRing = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.036, 16, 120), accentRingMaterial);
    accentRing.rotation.x = Math.PI / 2.4;
    accentRing.rotation.z = Math.PI / 6;
    accentGroup.add(accentRing);

    const accentCoreMaterial = new THREE.MeshBasicMaterial({
      color: '#dbe5d6',
      transparent: true,
      opacity: 0.34,
    });
    const accentCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), accentCoreMaterial);
    accentGroup.add(accentCore);

    const dustCount = 980;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);
    const dustColorA = new THREE.Color('#f6f4ea');
    const dustColorB = new THREE.Color('#dce8d3');

    for (let i = 0; i < dustCount; i += 1) {
      const i3 = i * 3;
      dustPositions[i3] = (Math.random() - 0.5) * 11.5;
      dustPositions[i3 + 1] = (Math.random() - 0.5) * 7.5;
      dustPositions[i3 + 2] = -5 + Math.random() * 7.5;

      mixedColor.lerpColors(dustColorA, dustColorB, Math.random());
      dustColors[i3] = mixedColor.r;
      dustColors[i3 + 1] = mixedColor.g;
      dustColors[i3 + 2] = mixedColor.b;
    }

    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

    const dustMaterial = new THREE.PointsMaterial({
      size: 0.018,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    const ambientLight = new THREE.AmbientLight('#efe8d7', 1.08);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#fffdf7', 1.18);
    keyLight.position.set(2.8, 2.2, 3.2);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight('#b8c8b0', 0.92, 18);
    fillLight.position.set(-2.2, -1.6, 2.4);
    scene.add(fillLight);

    const accentLight = new THREE.PointLight('#d9e8d7', 0.48, 14);
    accentLight.position.set(-2.4, 1.2, 2.8);
    scene.add(accentLight);

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = (event.clientY - rect.top) / Math.max(1, rect.height);
      pointer.targetX = (x - 0.5) * 1.8;
      pointer.targetY = (y - 0.5) * 1.2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let animationId = 0;
    const clock = new THREE.Clock();

    const renderFrame = () => {
      const elapsed = clock.getElapsedTime();
      pointer.x += (pointer.targetX - pointer.x) * 0.06;
      pointer.y += (pointer.targetY - pointer.y) * 0.06;

      globeGroup.position.x = 1.65 + Math.sin(elapsed * 0.32) * 0.18 + pointer.x * 0.34;
      globeGroup.position.y = -0.2 + Math.cos(elapsed * 0.43) * 0.12 + pointer.y * 0.26;
      globeGroup.rotation.y = elapsed * 0.13 + pointer.x * 0.22;
      globeGroup.rotation.x = Math.sin(elapsed * 0.23) * 0.12 + pointer.y * 0.24;

      shell.rotation.x = -elapsed * 0.08;
      shell.rotation.y = elapsed * 0.12;
      stars.rotation.y = elapsed * 0.04;
      stars.rotation.x = Math.cos(elapsed * 0.3) * 0.07;
      glowStars.rotation.y = -elapsed * 0.03;
      glowStars.rotation.x = Math.sin(elapsed * 0.2) * 0.08;
      orbitRing.rotation.z = elapsed * 0.24;

      accentGroup.position.x = -2.35 + Math.cos(elapsed * 0.52) * 0.16 - pointer.x * 0.12;
      accentGroup.position.y = 1.25 + Math.sin(elapsed * 0.66) * 0.1 - pointer.y * 0.1;
      accentGroup.rotation.y = -elapsed * 0.21;
      accentGroup.rotation.x = Math.sin(elapsed * 0.36) * 0.16;

      dust.rotation.y = -elapsed * 0.018;
      dust.position.x = Math.sin(elapsed * 0.2) * 0.18;

      starsMaterial.opacity = 0.7 + (Math.sin(elapsed * 1.8) + 1) * 0.075;
      glowStarsMaterial.opacity = 0.18 + (Math.cos(elapsed * 1.3) + 1) * 0.04;
      orbitRingMaterial.opacity = 0.14 + (Math.sin(elapsed * 1.1) + 1) * 0.07;
      accentRingMaterial.opacity = 0.16 + (Math.cos(elapsed * 1.2) + 1) * 0.06;
      accentCoreMaterial.opacity = 0.24 + (Math.sin(elapsed * 1.6) + 1) * 0.05;
      dustMaterial.opacity = 0.22 + (Math.cos(elapsed * 0.9) + 1) * 0.06;
      (core.material as THREE.MeshPhysicalMaterial).opacity = 0.17 + (Math.sin(elapsed * 1.4) + 1) * 0.035;
      (aura.material as THREE.MeshBasicMaterial).opacity = 0.08 + (Math.cos(elapsed * 1.1) + 1) * 0.026;
      aura.scale.setScalar(1 + Math.sin(elapsed * 0.95) * 0.062);

      renderer.render(scene, camera);
      animationId = window.requestAnimationFrame(renderFrame);
    };

    if (prefersReducedMotion) {
      renderer.render(scene, camera);
    } else {
      animationId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      if (animationId) window.cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);

      starsGeometry.dispose();
      starsMaterial.dispose();
      glowStarsMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      aura.geometry.dispose();
      (aura.material as THREE.Material).dispose();
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      orbitRing.geometry.dispose();
      orbitRingMaterial.dispose();
      accentRing.geometry.dispose();
      accentRingMaterial.dispose();
      accentCore.geometry.dispose();
      accentCoreMaterial.dispose();
      renderer.dispose();

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
