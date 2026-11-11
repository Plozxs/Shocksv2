"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Frecuencia, Ocurrencia, UNIDAD } from "@/lib/streaks";
import { fecha, pct } from "@/lib/formato";
import { COLORES, crearEscena, linea } from "@/components/three/escena";

interface Props {
  ocurrencias: Ocurrencia[];
  horizonte: number;
  frecuencia: Frecuencia;
  variacionActual: number | null;
}

interface Tip {
  x: number;
  y: number;
  o: Ocurrencia;
}

const ANCHO = 12; // eje x: variación acumulada de la racha
const FONDO = 10; // eje z: tiempo
const ALTO = 6; // eje y: retorno posterior

export default function Nube3D({ ocurrencias, horizonte, frecuencia, variacionActual }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const cont = ref.current;
    if (!cont) return;
    const puntos = ocurrencias.filter((o) => o.fwd[horizonte] !== null && o.fwd[horizonte] !== undefined);
    if (!puntos.length) return;

    const vars = puntos.map((o) => o.variacionK);
    if (variacionActual !== null) vars.push(variacionActual);
    const vMin = Math.min(...vars);
    const vMax = Math.max(...vars);
    const fwds = puntos.map((o) => o.fwd[horizonte] as number);
    const ordenados = fwds.map(Math.abs).sort((a, b) => a - b);
    const tope = ordenados[Math.floor(ordenados.length * 0.95)] || ordenados[ordenados.length - 1] || 0.01;
    const t0 = new Date(puntos[puntos.length - 1].fecha).getTime();
    const t1 = new Date(puntos[0].fecha).getTime();

    const xDe = (v: number) => (vMax === vMin ? 0 : ((v - vMin) / (vMax - vMin) - 0.5) * ANCHO);
    const zDe = (f: string) => (t1 === t0 ? 0 : (0.5 - (new Date(f).getTime() - t0) / (t1 - t0)) * FONDO);
    const yDe = (r: number) => (Math.max(-tope, Math.min(tope, r)) / tope) * (ALTO / 2);

    const esc = crearEscena(cont, new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(11, 7.5, 19));

    // Plano del cero
    const cero = new THREE.Mesh(
      new THREE.PlaneGeometry(ANCHO + 1, FONDO + 1),
      new THREE.MeshBasicMaterial({ color: COLORES.panel, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    cero.rotation.x = -Math.PI / 2;
    esc.scene.add(cero);
    const caja = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(ANCHO + 1, ALTO, FONDO + 1)),
      new THREE.LineBasicMaterial({ color: COLORES.linea }),
    );
    esc.scene.add(caja);

    // Plano de la racha actual
    if (variacionActual !== null) {
      const x = xDe(variacionActual);
      const plano = new THREE.Mesh(
        new THREE.PlaneGeometry(FONDO + 1, ALTO),
        new THREE.MeshBasicMaterial({ color: COLORES.ambar, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
      );
      plano.rotation.y = Math.PI / 2;
      plano.position.x = x;
      esc.scene.add(plano);
      esc.scene.add(linea([new THREE.Vector3(x, -ALTO / 2, FONDO / 2 + 0.5), new THREE.Vector3(x, ALTO / 2, FONDO / 2 + 0.5)], COLORES.ambar));
      esc.etiqueta(`hoy ${pct(variacionActual, 1)}`, new THREE.Vector3(x, ALTO / 2 + 0.2, FONDO / 2 + 0.5), "eje3d hoy");
    }

    const geo = new THREE.SphereGeometry(0.16, 18, 14);
    const esferas: THREE.Mesh[] = [];
    for (const o of puntos) {
      const r = o.fwd[horizonte] as number;
      const m = new THREE.MeshStandardMaterial({
        color: r >= 0 ? COLORES.compra : COLORES.venta,
        roughness: 0.4,
        transparent: !o.parecida,
        opacity: o.parecida ? 1 : 0.35,
      });
      const s = new THREE.Mesh(geo, m);
      s.position.set(xDe(o.variacionK), yDe(r), zDe(o.fecha));
      s.userData = o;
      esc.scene.add(s);
      esferas.push(s);
      // Hilo al plano del cero: deja ver la altura
      esc.scene.add(linea([new THREE.Vector3(s.position.x, 0, s.position.z), s.position.clone()], r >= 0 ? COLORES.compra : COLORES.venta, 0.35));
    }

    // Ejes
    const u = UNIDAD[frecuencia];
    const yBase = -ALTO / 2;
    for (const q of [0, 0.5, 1]) {
      const v = vMin + (vMax - vMin) * q;
      esc.etiqueta(pct(v, 0), new THREE.Vector3(xDe(v), yBase, FONDO / 2 + 0.9), "eje3d");
    }
    esc.etiqueta("variación acumulada de la racha", new THREE.Vector3(0, yBase, FONDO / 2 + 1.8), "eje3d titulo");
    const a0 = new Date(t0).getUTCFullYear();
    const a1 = new Date(t1).getUTCFullYear();
    esc.etiqueta(`${a0}`, new THREE.Vector3(-ANCHO / 2 - 1, yBase, zDe(puntos[puntos.length - 1].fecha)), "eje3d");
    esc.etiqueta(`${a1}`, new THREE.Vector3(-ANCHO / 2 - 1, yBase, zDe(puntos[0].fecha)), "eje3d");
    esc.etiqueta(`${pct(tope, 0)}`, new THREE.Vector3(ANCHO / 2 + 1.1, ALTO / 2, -FONDO / 2 - 0.5), "eje3d");
    esc.etiqueta("0%", new THREE.Vector3(ANCHO / 2 + 1.1, 0, -FONDO / 2 - 0.5), "eje3d");
    esc.etiqueta(`${pct(-tope, 0)}`, new THREE.Vector3(ANCHO / 2 + 1.1, -ALTO / 2, -FONDO / 2 - 0.5), "eje3d");
    esc.etiqueta(`a ${horizonte} ${horizonte === 1 ? u.una : u.varias}`, new THREE.Vector3(ANCHO / 2 + 1.1, ALTO / 2 + 0.6, -FONDO / 2 - 0.5), "eje3d titulo");

    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const mover = (ev: PointerEvent) => {
      const r = esc.renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, esc.camera);
      const hit = ray.intersectObjects(esferas, false)[0];
      if (hit) setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, o: hit.object.userData as Ocurrencia });
      else setTip(null);
    };
    const salir = () => setTip(null);
    esc.renderer.domElement.addEventListener("pointermove", mover);
    esc.renderer.domElement.addEventListener("pointerleave", salir);

    return () => {
      esc.renderer.domElement.removeEventListener("pointermove", mover);
      esc.renderer.domElement.removeEventListener("pointerleave", salir);
      geo.dispose();
      esc.destruir();
    };
  }, [ocurrencias, horizonte, frecuencia, variacionActual]);

  const u = UNIDAD[frecuencia];
  return (
    <div ref={ref} className="relative h-[460px] w-full overflow-hidden rounded-md border border-border">
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 rounded border border-border bg-panel px-3 py-2 text-xs shadow-sm"
          style={{ left: Math.min(tip.x + 14, (ref.current?.clientWidth ?? 600) - 220), top: Math.max(8, tip.y - 70) }}
        >
          <div className="font-semibold">{fecha(tip.o.fecha)}</div>
          <div className="mt-1 font-mono text-muted">
            racha {pct(tip.o.variacionK, 1)} · terminó en {tip.o.largoFinal} {u.varias}
            <br />a {horizonte} {horizonte === 1 ? u.una : u.varias}: {pct(tip.o.fwd[horizonte], 1)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
