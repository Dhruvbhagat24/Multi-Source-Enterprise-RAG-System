"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { useApp, type AIState } from "@/lib/store";

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9999.91) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Particle Field ─────────────────────────────────────────────────

function ParticleField() {
  const particlesRef = useRef<THREE.Points>(null);
  const [count, setCount] = useState(1200);

  useEffect(() => {
    const applyCount = () => {
      setCount(window.innerWidth < 900 ? 700 : 1200);
    };

    applyCount();
    window.addEventListener("resize", applyCount);
    return () => window.removeEventListener("resize", applyCount);
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const theta = seededRandom(i * 3 + 1) * Math.PI * 2;
      const phi = Math.acos(2 * seededRandom(i * 3 + 2) - 1);
      const r = 3 + seededRandom(i * 3 + 3) * 12;

      pos[i3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = r * Math.cos(phi);

      const t = seededRandom(i * 3 + 4);
      if (t < 0.33) {
        col[i3] = 0; col[i3 + 1] = 0.83; col[i3 + 2] = 1;
      } else if (t < 0.66) {
        col[i3] = 0.66; col[i3 + 1] = 0.33; col[i3 + 2] = 0.97;
      } else {
        col[i3] = 0.93; col[i3 + 1] = 0.28; col[i3 + 2] = 0.6;
      }
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.03,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  useFrame((state) => {
    if (!particlesRef.current) return;
    particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    particlesRef.current.rotation.x =
      Math.sin(state.clock.elapsedTime * 0.01) * 0.1;
  });

  return <points ref={particlesRef} geometry={geometry} material={material} />;
}

// ─── Neural Network Lines ───────────────────────────────────────────

function NeuralLines() {
  const groupRef = useRef<THREE.Group>(null);

  const lines = useMemo(() => {
    const lineObjects: THREE.Line[] = [];
    for (let i = 0; i < 40; i++) {
      const startR = 2 + seededRandom(i * 7 + 1) * 3;
      const endR = 2 + seededRandom(i * 7 + 2) * 3;
      const startTheta = seededRandom(i * 7 + 3) * Math.PI * 2;
      const endTheta = seededRandom(i * 7 + 4) * Math.PI * 2;
      const startPhi = Math.acos(2 * seededRandom(i * 7 + 5) - 1);
      const endPhi = Math.acos(2 * seededRandom(i * 7 + 6) - 1);

      const start = new THREE.Vector3(
        startR * Math.sin(startPhi) * Math.cos(startTheta),
        startR * Math.sin(startPhi) * Math.sin(startTheta),
        startR * Math.cos(startPhi)
      );
      const end = new THREE.Vector3(
        endR * Math.sin(endPhi) * Math.cos(endTheta),
        endR * Math.sin(endPhi) * Math.sin(endTheta),
        endR * Math.cos(endPhi)
      );

      const t = seededRandom(i * 7 + 7);
      const color = new THREE.Color().lerpColors(
        new THREE.Color(0x00d4ff),
        new THREE.Color(0xa855f7),
        t
      );

      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
      });

      lineObjects.push(new THREE.Line(geometry, material));
    }
    return lineObjects;
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (group) {
      lines.forEach((l) => group.add(l));
    }
    return () => {
      if (group) {
        lines.forEach((l) => group.remove(l));
      }
    };
  }, [lines]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.015;
    }
  });

  return <group ref={groupRef} />;
}

// ─── AI Orb ─────────────────────────────────────────────────────────

function AIOrb({ aiState }: { aiState: AIState }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const params = useMemo(() => {
    switch (aiState) {
      case "idle":
        return { speed: 0.5, glow: 0.3, scale: 1, color: new THREE.Color(0x6366f1), pulseSpeed: 1 };
      case "listening":
        return { speed: 1, glow: 0.5, scale: 1.05, color: new THREE.Color(0x00d4ff), pulseSpeed: 1.5 };
      case "thinking":
        return { speed: 2, glow: 0.8, scale: 1.15, color: new THREE.Color(0xa855f7), pulseSpeed: 3 };
      case "streaming":
        return { speed: 2.4, glow: 0.72, scale: 1.13, color: new THREE.Color(0x00f5d4), pulseSpeed: 4 };
      case "done":
        return { speed: 0.7, glow: 0.35, scale: 1.01, color: new THREE.Color(0x10b981), pulseSpeed: 0.8 };
    }
  }, [aiState]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (meshRef.current) {
      const targetScale = params.scale + Math.sin(t * params.pulseSpeed) * 0.05;
      meshRef.current.scale.setScalar(
        THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, 0.05)
      );
      meshRef.current.rotation.y = t * params.speed * 0.45;
      meshRef.current.rotation.z = Math.sin(t * 0.5) * 0.1;

      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        mat.emissiveIntensity,
        params.glow + Math.sin(t * params.pulseSpeed) * 0.25,
        0.05
      );
      mat.emissive.lerp(params.color, 0.05);
    }

    if (glowRef.current) {
      const glowScale =
        params.scale * 1.3 + Math.sin(t * params.pulseSpeed * 0.7) * 0.08;
      glowRef.current.scale.setScalar(glowScale);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, params.glow * 0.15, 0.05);
      mat.color.lerp(params.color, 0.05);
    }

    if (ringRef.current) {
      ringRef.current.rotation.x = t * params.speed * 0.55;
      ringRef.current.rotation.z = t * params.speed * 0.28;
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, params.glow * 0.3, 0.05);
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group position={[0, 0, 0]}>
        {/* Core orb */}
        <Sphere ref={meshRef} args={[0.5, 64, 64]}>
          <meshStandardMaterial
            color="#1a1a3e"
            emissive={params.color}
            emissiveIntensity={params.glow}
            roughness={0.1}
            metalness={0.8}
          />
        </Sphere>

        {/* Glow sphere */}
        <Sphere ref={glowRef} args={[0.65, 32, 32]}>
          <meshBasicMaterial
            color={params.color}
            transparent
            opacity={0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </Sphere>

        {/* Orbit ring */}
        <mesh ref={ringRef} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.8, 0.008, 16, 100]} />
          <meshBasicMaterial
            color={params.color}
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Second orbit ring */}
        <mesh rotation={[Math.PI / 5, Math.PI / 4, 0]}>
          <torusGeometry args={[0.9, 0.005, 16, 100]} />
          <meshBasicMaterial
            color="#a855f7"
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </Float>
  );
}

// ─── Mouse Parallax Group ───────────────────────────────────────────

function MouseParallaxGroup({
  children,
  sidebarOpen,
}: {
  children: React.ReactNode;
  sidebarOpen: boolean;
}) {
  const { viewport, size } = useThree();
  const sidebarWidthPx = sidebarOpen ? 280 : 68;
  const xOffset = (sidebarWidthPx / 2) * (viewport.width / size.width);

  return <group position={[xOffset, 0, 0]}>{children}</group>;
}

// ─── Main Scene Component ───────────────────────────────────────────

export default function Scene3D() {
  const { aiState, sidebarOpen } = useApp();

  return (
    <div className="three-canvas">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 60 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        dpr={[1, 1.4]}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[5, 5, 5]} intensity={0.5} color="#6366f1" />
        <pointLight position={[-5, -5, -5]} intensity={0.3} color="#a855f7" />

        <MouseParallaxGroup sidebarOpen={sidebarOpen}>
          <ParticleField />
          <NeuralLines />
          <AIOrb aiState={aiState} />
        </MouseParallaxGroup>
      </Canvas>
    </div>
  );
}
