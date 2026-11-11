"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CeldaBarrera } from "@/lib/quant";
import { pct, prob } from "@/lib/formato";
import { COLORES, colorDivergente, crearEscena, linea } from "@/components/three/escena";

export type MetricaBarrera = "ev" | "exceso" | "pTarget";

interface Props {
  celdas: CeldaBarrera[];
  metrica: MetricaBarrera;
  mejor: CeldaBarrera | null;
}

const PASO_X = 1.2;
const PASO_Z = 1.0;
const ALTO = 3.2;

export function valorBarrera(c: CeldaBarrera, m: MetricaBarrera): number {
  if (m === "pTarget") return c.pTarget - 0.5;
  return m === "ev" ? c.ev : c.ev - c.evBase;
}

export default function Barreras3D({ celdas, metrica, mejor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; c: CeldaBarrera } | null>(null);

  useEffect(() => {
    const cont = ref.current;
    if (!cont || !celdas.length) return;
    const stops = Array.from(new Set(celdas.map((c) => c.stop))).sort((a, b) => a - b);
    const targets = Array.from(new Set(celdas.map((c) => c.target))).sort((a, b) => a - b);
    const nx = stops.length;
    const nz = targets.length;
    const xDe = (i: number) => (i - (nx - 1) / 2) * PASO_X;
    const zDe = (j: number) => ((nz - 1) / 2 - j) * PASO_Z; // target chico adelante
    const celda = (i: number, j: number) => celdas.find((c) => c.stop === stops[i] && c.target === targets[j]) as CeldaBarrera;
    const vals = celdas.map((c) => valorBarrera(c, metrica));
    const escala = Math.max(...vals.map(Math.abs), 1e-6);
    const yDe = (v: number) => (v / escala) * (ALTO / 2);

    const esc = crearEscena(cont, new THREE.Vector3(0, 0, 0), new THREE.Vector3(9, 8.5, 12));

    // Superficie con colores por vértice
    const geo = new THREE.PlaneGeometry((nx - 1) * PASO_X, (nz - 1) * PASO_Z, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colores: number[] = [];
    for (let k = 0; k < pos.count; k += 1) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const i = Math.round(x / PASO_X + (nx - 1) / 2);
      const j = Math.round((nz - 1) / 2 - z / PASO_Z);
      const v = valorBarrera(celda(i, j), metrica);
      pos.setY(k, yDe(v));
      const col = colorDivergente(v, escala);
      colores.push(col.r, col.g, col.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colores, 3));
    geo.computeVertexNormals();
    const sup = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, flatShading: false }),
    );
    esc.scene.add(sup);
    const malla = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: COLORES.tinta, transparent: true, opacity: 0.18 }),
    );
    esc.scene.add(malla);

    // Plano del cero
    const cero = new THREE.Mesh(
      new THREE.PlaneGeometry((nx - 1) * PASO_X + 0.8, (nz - 1) * PASO_Z + 0.8),
      new THREE.MeshBasicMaterial({ color: COLORES.gris, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    cero.rotation.x = -Math.PI / 2;
    esc.scene.add(cero);

    // Puntos sobre cada nodo, para el hover
    const nodos: THREE.Mesh[] = [];
    const g = new THREE.SphereGeometry(0.07, 10, 8);
    const mNodo = new THREE.MeshBasicMaterial({ color: COLORES.tinta, transparent: true, opacity: 0.45 });
    stops.forEach((_, i) =>
      targets.forEach((__, j) => {
        const c = celda(i, j);
        const s = new THREE.Mesh(g, mNodo);
        s.position.set(xDe(i), yDe(valorBarrera(c, metrica)), zDe(j));
        s.userData = c;
        esc.scene.add(s);
        nodos.push(s);
      }),
    );

    // La mejor combinación
    if (mejor) {
      const i = stops.indexOf(mejor.stop);
      const j = targets.indexOf(mejor.target);
      const y = yDe(valorBarrera(mejor, metrica));
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), new THREE.MeshStandardMaterial({ color: COLORES.ambar }));
      m.position.set(xDe(i), y, zDe(j));
      esc.scene.add(m);
      esc.scene.add(linea([new THREE.Vector3(xDe(i), 0, zDe(j)), new THREE.Vector3(xDe(i), y + 0.9, zDe(j))], COLORES.ambar));
      esc.etiqueta(`stop ${pct(mejor.stop, 1, false)} · target ${pct(mejor.target, 0, false)}`, new THREE.Vector3(xDe(i), y + 1.1, zDe(j)), "eje3d hoy");
    }

    // Ejes
    const zFrente = zDe(0) + 0.7;
    stops.forEach((s, i) => {
      if (i % 2 === 0 || i === nx - 1) esc.etiqueta(`−${pct(s, s < 0.02 ? 1 : 0, false)}`, new THREE.Vector3(xDe(i), 0, zFrente), "eje3d");
    });
    esc.etiqueta("stop", new THREE.Vector3(0, 0, zFrente + 0.8), "eje3d titulo");
    const xDer = xDe(nx - 1) + 0.8;
    targets.forEach((t, j) => {
      if (j % 2 === 0 || j === nz - 1) esc.etiqueta(`+${pct(t, 0, false)}`, new THREE.Vector3(xDer, 0, zDe(j)), "eje3d");
    });
    esc.etiqueta("target", new THREE.Vector3(xDer + 0.9, 0, 0), "eje3d titulo");

    const ray = new THREE.Raycaster();
    ray.params.Points = { threshold: 0.2 };
    const mouse = new THREE.Vector2();
    const mover = (ev: PointerEvent) => {
      const r = esc.renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, esc.camera);
      const hit = ray.intersectObject(sup, false)[0];
      if (!hit) return setTip(null);
      // Nodo más cercano al punto tocado
      let mejorNodo = nodos[0];
      let d = Infinity;
      for (const nodo of nodos) {
        const dd = nodo.position.distanceTo(hit.point);
        if (dd < d) {
          d = dd;
          mejorNodo = nodo;
        }
      }
      setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, c: mejorNodo.userData as CeldaBarrera });
    };
    const salir = () => setTip(null);
    esc.renderer.domElement.addEventListener("pointermove", mover);
    esc.renderer.domElement.addEventListener("pointerleave", salir);
    return () => {
      esc.renderer.domElement.removeEventListener("pointermove", mover);
      esc.renderer.domElement.removeEventListener("pointerleave", salir);
      g.dispose();
      esc.destruir();
    };
  }, [celdas, metrica, mejor]);

  return (
    <div ref={ref} className="relative h-[440px] w-full overflow-hidden rounded-md border border-border">
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 rounded border border-border bg-panel px-3 py-2 text-xs shadow-sm"
          style={{ left: Math.min(tip.x + 14, (ref.current?.clientWidth ?? 600) - 230), top: Math.max(8, tip.y - 90) }}
        >
          <div className="font-semibold">
            Stop −{pct(tip.c.stop, 1, false)} · target +{pct(tip.c.target, 0, false)}
          </div>
          <div className="mt-1 font-mono leading-relaxed text-muted">
            target primero {prob(tip.c.pTarget)} · stop {prob(tip.c.pStop)} · ninguno {prob(tip.c.pNada)}
            <br />
            esperado {pct(tip.c.ev, 2)} neto · cualquier día {pct(tip.c.evBase, 2)}
            <br />
            {tip.c.n} operaciones
          </div>
        </div>
      ) : null}
    </div>
  );
}
