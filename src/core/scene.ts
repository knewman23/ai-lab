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
  // palette without a "change" listener here. Do not mutate this Color: it is
  // the shared palette, not a copy.
  scene.background = theme.bg;

  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  // A sane default so a viz that forgets to frame its scene is not a black
  // frame; every viz is expected to re-position the camera anyway.
  camera.position.set(4, -5, 4);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !opts.reducedMotion;

  // Light colours are exempt from the no-hard-coded-colour rule: they shape the
  // shading, they are not part of the palette.
  const hemisphere = new HemisphereLight(0xffffff, 0x404040, 0.4);
  // The constructor seeds position from Object3D.DEFAULT_UP (0, 1, 0), which would
  // run the sky-to-ground gradient sideways in this Z-up scene.
  hemisphere.position.set(0, 0, 1);
  const directional = new DirectionalLight(0xffffff, 1.0);
  directional.position.set(3, -4, 6);
  scene.add(hemisphere, directional);

  return {
    scene,
    camera,
    controls,
    dispose() {
      controls.dispose();
      scene.clear();
      // Drop the shared palette Color so the scene holds nothing of the theme.
      scene.background = null;
    },
  };
}

function disposeMaterial(material: Material): void {
  // Materials name their textures differently (map, normalMap, alphaMap, ...),
  // so dispose whatever texture-valued properties this one happens to carry.
  for (const value of Object.values(material) as unknown[]) {
    const texture = value as Texture | null;
    if (texture?.isTexture === true) texture.dispose();
  }
  material.dispose();
}

/**
 * Releases every geometry, material and material texture under `root`.
 * It does not remove `root` from its parent; detach it yourself if needed.
 */
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
