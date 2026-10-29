"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import * as THREE from "three"

/*
 * "Mav", the gift-box mascot, drawn with plain three.js shapes (no model files to download).
 * It floats, blinks, waves hello and turns gently towards the pointer. In "celebrate" mode the
 * lid pops and confetti bursts out. Everything stops moving when the user prefers reduced motion.
 */

const NAVY = "#1d3f8f"
const GOLD = "#f1b73b"
const RIBBON = "#e5533d"

function Confetti({ active }: { active: boolean }) {
  const group = useRef<THREE.Group>(null)
  const parts = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        dir: new THREE.Vector3(Math.cos(i * 2.4) * (0.4 + (i % 5) * 0.12), 1.4 + (i % 7) * 0.18, Math.sin(i * 2.4) * (0.4 + (i % 3) * 0.15)),
        color: ["#f1b73b", "#e5533d", "#5b8fd9", "#4cc29a", "#b391e6"][i % 5],
        spin: 2 + (i % 4),
      })),
    [],
  )
  const t0 = useRef<number | null>(null)
  useFrame((state) => {
    const g = group.current
    if (!g) return
    if (!active) {
      g.visible = false
      t0.current = null
      return
    }
    t0.current ??= state.clock.elapsedTime
    const t = (state.clock.elapsedTime - t0.current) % 3.2
    g.visible = true
    g.children.forEach((c, i) => {
      const p = parts[i]
      c.position.set(p.dir.x * t * 1.2, 0.9 + p.dir.y * t - 1.1 * t * t, p.dir.z * t * 1.2)
      c.rotation.set(t * p.spin, t * p.spin * 0.7, 0)
    })
  })
  return (
    <group ref={group}>
      {parts.map((p, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.07, 0.07, 0.015]} />
          <meshStandardMaterial color={p.color} />
        </mesh>
      ))}
    </group>
  )
}

function Mav({ celebrate, still }: { celebrate?: boolean; still?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const lid = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (still) return
    const t = state.clock.elapsedTime
    if (root.current) {
      root.current.position.y = Math.sin(t * 1.6) * 0.06
      // look towards the pointer, gently
      root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, state.pointer.x * 0.45 - 0.15, 0.06)
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, -state.pointer.y * 0.15, 0.06)
    }
    // wave for the first few seconds, then every 6 seconds
    if (arm.current) {
      const cycle = t % 6
      const waving = t < 3.2 || cycle < 1.6
      arm.current.rotation.z = waving ? -2.2 + Math.sin(t * 9) * 0.45 : THREE.MathUtils.lerp(arm.current.rotation.z, -0.35, 0.08)
    }
    // blink
    if (eyes.current) eyes.current.scale.y = t % 4 < 0.12 ? 0.15 : 1
    if (lid.current) {
      const target = celebrate ? 0.55 + Math.sin(t * 4) * 0.05 : 0
      lid.current.position.y = THREE.MathUtils.lerp(lid.current.position.y, 0.62 + target, 0.1)
      lid.current.rotation.z = THREE.MathUtils.lerp(lid.current.rotation.z, celebrate ? 0.25 : 0, 0.1)
    }
  })

  return (
    <group ref={root} rotation={[0, -0.15, 0]}>
      {/* body */}
      <mesh castShadow>
        <boxGeometry args={[1.25, 1.05, 1.1]} />
        <meshStandardMaterial color={NAVY} roughness={0.45} metalness={0.05} />
      </mesh>
      {/* ribbon down the front */}
      <mesh position={[0, 0, 0.556]}>
        <boxGeometry args={[0.2, 1.06, 0.01]} />
        <meshStandardMaterial color={GOLD} roughness={0.4} />
      </mesh>
      {/* face */}
      <group ref={eyes} position={[0, 0.08, 0.57]}>
        {[-0.3, 0.3].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh>
              <sphereGeometry args={[0.13, 24, 24]} />
              <meshStandardMaterial color="#ffffff" roughness={0.2} />
            </mesh>
            <mesh position={[0.02, -0.01, 0.1]}>
              <sphereGeometry args={[0.06, 16, 16]} />
              <meshStandardMaterial color="#0b1730" roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, -0.2, 0.56]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.14, 0.03, 12, 24, Math.PI]} />
        <meshStandardMaterial color="#0b1730" />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <mesh key={x} position={[x, -0.1, 0.56]}>
          <circleGeometry args={[0.08, 20]} />
          <meshStandardMaterial color="#ff8a8a" transparent opacity={0.55} />
        </mesh>
      ))}
      {/* lid with ribbon and bow */}
      <group ref={lid} position={[0, 0.62, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.38, 0.24, 1.22]} />
          <meshStandardMaterial color={GOLD} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[0.22, 0.25, 1.23]} />
          <meshStandardMaterial color={RIBBON} roughness={0.4} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.16, 0.22, 0]} rotation={[Math.PI / 2, 0, s * 0.5]}>
            <torusGeometry args={[0.14, 0.05, 12, 24]} />
            <meshStandardMaterial color={RIBBON} roughness={0.4} />
          </mesh>
        ))}
      </group>
      {/* arms: left resting, right waving from the shoulder */}
      <mesh position={[-0.72, -0.12, 0.05]} rotation={[0, 0, 0.35]}>
        <capsuleGeometry args={[0.08, 0.32, 6, 12]} />
        <meshStandardMaterial color={NAVY} roughness={0.45} />
      </mesh>
      <group ref={arm} position={[0.66, 0.1, 0.05]} rotation={[0, 0, -2.2]}>
        <mesh position={[0, -0.24, 0]}>
          <capsuleGeometry args={[0.08, 0.32, 6, 12]} />
          <meshStandardMaterial color={NAVY} roughness={0.45} />
        </mesh>
        <mesh position={[0, -0.47, 0]}>
          <sphereGeometry args={[0.11, 16, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
      </group>
      {/* feet */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, -0.6, 0.12]}>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshStandardMaterial color="#0b1730" roughness={0.6} />
        </mesh>
      ))}
      <Confetti active={!!celebrate && !still} />
    </group>
  )
}

export default function Mav3D({ celebrate, className }: { celebrate?: boolean; className?: string }) {
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  return (
    <div className={className} aria-hidden>
      <Canvas camera={{ position: [0, 0.35, 4.1], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} frameloop={still ? "demand" : "always"}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        <directionalLight position={[-4, 2, -2]} intensity={0.5} color="#9cbcf2" />
        <Mav celebrate={celebrate} still={!!still} />
        <mesh position={[0, -0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.9, 32]} />
          <meshBasicMaterial color="#0b1730" transparent opacity={0.12} />
        </mesh>
      </Canvas>
    </div>
  )
}
