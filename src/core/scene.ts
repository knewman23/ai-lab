import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  type Material,
  type Texture,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Renderer, ThemeColors } from "../viz/types";

export interface SceneKit {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  dispose(): void;
}

/** The scene, camera and controls every visualization starts from. */
export function createSceneKit(
  renderer: Renderer,
  theme: ThemeColors,
  opts: { reducedMotion: boolean },
): SceneKit {
  const scene = new Scene();
  // theme.bg is mutated in place by refresh(), so the background tracks the
  // palette without a "change" listener here.
  scene.background = theme.bg;

  const camera = new PerspectiveCamera(45, 1, 0.1, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !opts.reducedMotion;

  // Light colours are exempt from the no-hard-coded-colour rule: they shape the
  // shading, they are not part of the palette.
  const hemisphere = new HemisphereLight(0xffffff, 0xffffff, 0.6);
  const directional = new DirectionalLight(0xffffff, 1.4);
  directional.position.set(3, 6, 4);
  scene.add(hemisphere, directional);

  return {
    scene,
    camera,
    controls,
    dispose() {
      controls.dispose();
    },
  };
}

function disposeMaterial(material: Material): void {
  const { map } = material as { map?: Texture | null };
  if (map) map.dispose();
  material.dispose();
}

/** Releases every geometry, material and material texture under `root`. */
export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    // Meshes, lines, points and sprites all carry these; Object3D does not declare them.
    const { geometry, material } = object as {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    if (geometry) geometry.dispose();
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
}

export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== "function") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
