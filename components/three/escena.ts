import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export const COLORES = {
  papel: 0xfafaf7,
  panel: 0xf3f2ee,
  linea: 0xd9d6ce,
  tinta: 0x1e2326,
  gris: 0x8a9296,
  compra: 0x4f7a4a,
  venta: 0xa4473b,
  celeste: 0x3e9db0,
  celesteTinta: 0x1f6e7e,
  ambar: 0xb07a2a,
};

export interface Escena {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  etiqueta: (texto: string, pos: THREE.Vector3, clase?: string) => CSS2DObject;
  alCuadro: (fn: () => void) => void;
  destruir: () => void;
}

export function crearEscena(contenedor: HTMLElement, objetivo: THREE.Vector3, posCamara: THREE.Vector3): Escena {
  const ancho = contenedor.clientWidth;
  const alto = contenedor.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORES.papel);

  const camera = new THREE.PerspectiveCamera(38, ancho / alto, 0.1, 500);
  camera.position.copy(posCamara);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(ancho, alto);
  contenedor.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(ancho, alto);
  labels.domElement.style.position = "absolute";
  labels.domElement.style.inset = "0";
  labels.domElement.style.pointerEvents = "none";
  contenedor.appendChild(labels.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(objetivo);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sol = new THREE.DirectionalLight(0xffffff, 0.9);
  sol.position.set(12, 22, 14);
  scene.add(sol);
  const relleno = new THREE.DirectionalLight(0xffffff, 0.3);
  relleno.position.set(-14, 8, -10);
  scene.add(relleno);

  const etiqueta = (texto: string, pos: THREE.Vector3, clase = "eje3d") => {
    const div = document.createElement("div");
    div.className = clase;
    div.textContent = texto;
    const obj = new CSS2DObject(div);
    obj.position.copy(pos);
    scene.add(obj);
    return obj;
  };

  const tareas: Array<() => void> = [];
  let vivo = true;
  const loop = () => {
    if (!vivo) return;
    controls.update();
    for (const t of tareas) t();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const ro = new ResizeObserver(() => {
    const w = contenedor.clientWidth;
    const h = contenedor.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
  });
  ro.observe(contenedor);

  return {
    scene,
    camera,
    renderer,
    controls,
    etiqueta,
    alCuadro: (fn) => tareas.push(fn),
    destruir: () => {
      vivo = false;
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}

/** Rojo para negativo, verde para positivo, con intensidad según |v| / escala. */
export function colorDivergente(v: number, escala: number): THREE.Color {
  const t = Math.min(1, Math.abs(v) / (escala || 1));
  const neutro = new THREE.Color(0xe8e6e0);
  const extremo = new THREE.Color(v >= 0 ? COLORES.compra : COLORES.venta);
  return neutro.lerp(extremo, 0.25 + 0.75 * t);
}

export function linea(puntos: THREE.Vector3[], color: number, opacidad = 1): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(puntos);
  const m = new THREE.LineBasicMaterial({ color, transparent: opacidad < 1, opacity: opacidad });
  return new THREE.Line(g, m);
}
