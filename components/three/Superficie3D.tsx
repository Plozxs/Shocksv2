"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CeldaSuperficie, Frecuencia, UNIDAD } from "@/lib/streaks";
import { num, pct, prob } from "@/lib/formato";
import { COLORES, colorDivergente, crearEscena, linea } from "@/components/three/escena";

export type MetricaSuperficie = "exceso" | "media" | "pSuba";

interface Props {
  celdas: CeldaSuperficie[];
  frecuencia: Frecuencia;
  kActual: number;
  metrica: MetricaSuperficie;
}

interface Tip {
  x: number;
  y: number;
  c: CeldaSuperficie;
}

const SX = 1.15;
const SZ = 1.5;
const ALTO = 3.2;
const N_MIN = 8;

function valor(c: CeldaSuperficie, m: MetricaSuperficie): number | null {
  if (c.n < N_MIN) return null;
  if (m === "pSuba") return c.pSuba === null ? null : c.pSuba - 0.5;
  return m === "media" ? c.media : c.exceso;
}

export default function Superficie3D({ celdas, frecuencia, kActual, metrica }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const cont = ref.current;
    if (!cont || !celdas.length) return;
    const ks = Array.from(new Set(celdas.map((c) => c.k))).sort((a, b) => a - b);
    const hs = Array.from(new Set(celdas.map((c) => c.h))).sort((a, b) => a - b);
    const xDe = (k: number) => {
      const i = ks.indexOf(k);
      // Hueco entre bajas y subas.
      return (i - (ks.length - 1) / 2) * SX + (k > 0 ? 0.45 : -0.45);
    };
    const zDe = (h: number) => (hs.indexOf(h) - (hs.length - 1) / 2) * SZ;

    const vals = celdas.map((c) => valor(c, metrica)).filter((v): v is number => v !== null);
    // Escala robusta: percentil 90 de |v| para que un extremo no aplaste al resto.
    const abs = vals.map(Math.abs).sort((a, b) => a - b);
    const escala = abs.length ? abs[Math.floor(abs.length * 0.9)] || abs[abs.length - 1] || 1 : 1;

    const anchoX = ks.length * SX + 1;
    const anchoZ = hs.length * SZ;
    const esc = crearEscena(
      cont,
      new THREE.Vector3(0, -0.2, 0.6),
      new THREE.Vector3(anchoX * 0.12, anchoX * 0.42, anchoZ * 0.9 + anchoX * 0.42),
    );

    // Piso
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(anchoX + 1.5, anchoZ + 1.5),
      new THREE.MeshStandardMaterial({ color: COLORES.panel, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = -0.002;
    esc.scene.add(piso);
    for (const h of hs) {
      const z = zDe(h);
      esc.scene.add(linea([new THREE.Vector3(-anchoX / 2 - 0.4, 0, z), new THREE.Vector3(anchoX / 2 + 0.4, 0, z)], COLORES.linea));
    }

    const cajas: THREE.Mesh[] = [];
    for (const c of celdas) {
      const v = valor(c, metrica);
      const x = xDe(c.k);
      const z = zDe(c.h);
      if (v === null) {
        const vacia = new THREE.Mesh(
          new THREE.BoxGeometry(SX * 0.78, 0.02, SZ * 0.62),
          new THREE.MeshStandardMaterial({ color: 0xdedbd3, transparent: true, opacity: 0.6 }),
        );
        vacia.position.set(x, 0.01, z);
        vacia.userData = c;
        esc.scene.add(vacia);
        cajas.push(vacia);
        continue;
      }
      const alto = Math.max(0.03, (Math.abs(v) / escala) * ALTO * 0.5);
      const recortada = alto > ALTO;
      const altoTope = Math.min(alto, ALTO);
      const mat = new THREE.MeshStandardMaterial({
        color: colorDivergente(v, escala),
        roughness: 0.55,
        metalness: 0.05,
        transparent: c.n < 15,
        opacity: c.n < 15 ? 0.55 : 1,
      });
      const caja = new THREE.Mesh(new THREE.BoxGeometry(SX * 0.78, altoTope, SZ * 0.62), mat);
      caja.position.set(x, v >= 0 ? altoTope / 2 : -altoTope / 2, z);
      caja.userData = c;
      esc.scene.add(caja);
      cajas.push(caja);
      if (recortada) {
        const tapa = new THREE.Mesh(
          new THREE.BoxGeometry(SX * 0.82, 0.06, SZ * 0.66),
          new THREE.MeshStandardMaterial({ color: COLORES.tinta }),
        );
        tapa.position.set(x, v >= 0 ? altoTope : -altoTope, z);
        esc.scene.add(tapa);
      }
      if (c.k === kActual) {
        const borde = new THREE.LineSegments(
          new THREE.EdgesGeometry(caja.geometry),
          new THREE.LineBasicMaterial({ color: COLORES.ambar }),
        );
        borde.position.copy(caja.position);
        esc.scene.add(borde);
      }
    }

    // Ejes
    const zFrente = zDe(hs[hs.length - 1]) + SZ * 0.85;
    for (const k of ks) {
      const e = esc.etiqueta(k > 0 ? `+${k}` : `${k}`, new THREE.Vector3(xDe(k), 0, zFrente), k === kActual ? "eje3d hoy" : "eje3d");
      e.center.set(0.5, 0);
    }
    const u = UNIDAD[frecuencia];
    esc.etiqueta(`← ${u.varias} de baja seguidas`, new THREE.Vector3(xDe(ks[0]) + 2.2, 0, zFrente + 1.3), "eje3d titulo");
    esc.etiqueta(`${u.varias} de suba seguidas →`, new THREE.Vector3(xDe(ks[ks.length - 1]) - 2.2, 0, zFrente + 1.3), "eje3d titulo");
    const xDer = xDe(ks[ks.length - 1]) + SX * 0.9;
    for (const h of hs) esc.etiqueta(`${h} ${u.corta}`, new THREE.Vector3(xDer, 0, zDe(h)), "eje3d");
    esc.etiqueta("horizonte", new THREE.Vector3(xDer + 0.2, 0, zDe(hs[0]) - SZ * 0.9), "eje3d titulo");
    if (ks.includes(kActual)) {
      esc.etiqueta("hoy ▾", new THREE.Vector3(xDe(kActual), ALTO * 0.55, zDe(hs[hs.length - 1]) + SZ * 0.4), "eje3d hoy");
    }

    // Hover
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const mover = (ev: PointerEvent) => {
      const r = esc.renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, esc.camera);
      const hit = ray.intersectObjects(cajas, false)[0];
      if (hit) setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, c: hit.object.userData as CeldaSuperficie });
      else setTip(null);
    };
    const salir = () => setTip(null);
    esc.renderer.domElement.addEventListener("pointermove", mover);
    esc.renderer.domElement.addEventListener("pointerleave", salir);

    return () => {
      esc.renderer.domElement.removeEventListener("pointermove", mover);
      esc.renderer.domElement.removeEventListener("pointerleave", salir);
      esc.destruir();
    };
  }, [celdas, frecuencia, kActual, metrica]);

  const u = UNIDAD[frecuencia];
  return (
    <div ref={ref} className="relative h-[460px] w-full overflow-hidden rounded-md border border-border">
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 rounded border border-border bg-panel px-3 py-2 text-xs shadow-sm"
          style={{ left: Math.min(tip.x + 14, (ref.current?.clientWidth ?? 600) - 210), top: Math.max(8, tip.y - 70) }}
        >
          <div className="font-semibold">
            {Math.abs(tip.c.k)} {Math.abs(tip.c.k) === 1 ? u.una : u.varias} de {tip.c.k < 0 ? "baja" : "suba"} · {tip.c.h} {tip.c.h === 1 ? u.una : u.varias} después
          </div>
          <div className="mt-1 font-mono text-muted">
            {tip.c.n < N_MIN ? (
              <>Solo {num(tip.c.n)} casos: no alcanza para estimar</>
            ) : (
              <>
                media {pct(tip.c.media, 2)} · vs. base {pct(tip.c.exceso, 2)}
                <br />
                subió {prob(tip.c.pSuba)} de las veces · {num(tip.c.n)} casos
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
