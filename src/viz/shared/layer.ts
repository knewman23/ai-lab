import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";

/** A world-space point. */
export type Vec3 = readonly [number, number, number];

/**
 * An axis-aligned face of the scene box that a layer can draw on. Centred
 * face-local (a, b) lands at world `centre + (a, b)` along `axes`, with the
 * fixed axis held at `offset + lift`, just inside the face.
 */
export interface Face {
  readonly axes: readonly [0 | 1 | 2, 0 | 1 | 2];
  readonly fixedAxis: 0 | 1 | 2;
  readonly offset: number;
  readonly lift: number;
  readonly centre: readonly [number, number];
}

/**
 * The three visible faces of the 6x6x6 corner with vertex (-3, 0, 0); `lift`
 * points along each face's interior normal (front +y, side +x, floor +z).
 */
export const FACES = {
  front: { axes: [0, 2], fixedAxis: 1, offset: 0, lift: 0.01, centre: [0, 3] },
  side: { axes: [1, 2], fixedAxis: 0, offset: -3, lift: 0.01, centre: [3, 3] },
  floor: { axes: [0, 1], fixedAxis: 2, offset: 0, lift: 0.01, centre: [0, 3] },
} satisfies Record<"front" | "side" | "floor", Face>;

/** A line layer and the buffer it draws from. */
export interface Layer {
  readonly object: LineSegments;
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
  /** (x, y, z) per endpoint; `setDrawRange` decides how much of it is live. */
  readonly positions: Float32Array;
  /** The face that (a, b) writes land on; a flat layer without one draws at (a, 0, b). */
  readonly face?: Face;
}

/** How a layer sits in the scene; the default is a flat layer in the plane y = 0. */
export interface LayerOptions {
  /** Draw on this face of the scene box, depth-tested against it. */
  readonly face?: Face;
  /** A world-coordinate layer, depth-tested, fed by `writeWorldSegments`. */
  readonly depth?: boolean;
}

/**
 * One line layer over a preallocated buffer of `endpoints` vertices, drawn as
 * LineSegments so a curve can have gaps in it.
 *
 * Without options the layer is flat: everything lies in the plane y = 0 as a
 * stack of coplanar layers, so depth testing is off and `renderOrder` alone
 * decides what sits above what. A face or depth layer depth-tests against the
 * scene instead, still without writing depth so layers on one face never
 * occlude each other.
 */
export function lineLayer(endpoints: number, renderOrder: number, opts: LayerOptions = {}): Layer {
  const positions = new Float32Array(endpoints * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new LineBasicMaterial({
    transparent: true,
    depthTest: opts.face !== undefined || opts.depth === true,
    depthWrite: false,
  });
  const object = new LineSegments(geometry, material);
  object.renderOrder = renderOrder;
  const layer: Layer = { object, geometry, material, positions };
  return opts.face === undefined ? layer : { ...layer, face: opts.face };
}

/** Publishes the first `endpoints` vertices of a layer's buffer. */
export function commit(layer: Layer, endpoints: number): void {
  layer.geometry.getAttribute("position").needsUpdate = true;
  layer.geometry.setDrawRange(0, endpoints);
  layer.geometry.computeBoundingSphere();
}

/** Releases a layer's GPU resources. */
export function disposeLayers(layers: readonly Layer[]): void {
  for (const layer of layers) {
    layer.geometry.dispose();
    layer.material.dispose();
  }
}
