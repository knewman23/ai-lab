import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import type { Graph, GraphNode } from "../../core/math/autograd";
import type { ThemeColors } from "../types";
import type { Positions } from "./layout";
import { wallPoint } from "./layout";

export interface Nodes {
  readonly group: Group;
  /** Node id → its sphere, for the current graph; read by tests. */
  readonly meshes: ReadonlyMap<string, Mesh>;
  /** Places (and, for a new graph, rebuilds) the spheres; dims nodes whose value is not in `revealedValues`. */
  set(g: Graph, positions: Positions, revealedValues: ReadonlySet<string>): void;
  dispose(): void;
}

type Role = "leaf" | "op" | "output";

const LEAF_RADIUS = 0.16;
const OP_RADIUS = 0.14;
const ORDER = 10;
const DIM_OPACITY = 0.35;

function roleOf(g: Graph, node: GraphNode): Role {
  if (node.id === g.output) return "output";
  return node.op === "leaf" ? "leaf" : "op";
}

function colourOf(theme: ThemeColors, role: Role) {
  return role === "leaf" ? theme.ink : role === "op" ? theme.soft : theme.accent;
}

/**
 * One sphere per node on the wall: leaves `--ink` r 0.16, ops `--soft` r 0.14, the output
 * `--accent` r 0.16. Each mesh owns its material because opacity differs per node; the two
 * geometries are shared and live as long as the layer. Meshes are rebuilt when `graph.key` changes.
 */
export function createNodes(theme: ThemeColors): Nodes {
  const bigGeometry = new SphereGeometry(LEAF_RADIUS, 24, 16);
  const opGeometry = new SphereGeometry(OP_RADIUS, 24, 16);
  const group = new Group();
  const meshes = new Map<string, Mesh>();
  const roles = new Map<string, Role>();
  let currentKey: string | null = null;

  function applyTheme(): void {
    for (const [id, mesh] of meshes) {
      (mesh.material as MeshStandardMaterial).color.copy(colourOf(theme, roles.get(id)!));
    }
  }
  theme.addEventListener("change", applyTheme);

  function clear(): void {
    for (const mesh of meshes.values()) (mesh.material as MeshStandardMaterial).dispose();
    meshes.clear();
    roles.clear();
    group.clear();
  }

  function rebuild(g: Graph): void {
    clear();
    for (const node of g.nodes) {
      const role = roleOf(g, node);
      const mesh = new Mesh(
        role === "op" ? opGeometry : bigGeometry,
        new MeshStandardMaterial({ roughness: 0.5, transparent: true }),
      );
      mesh.renderOrder = ORDER;
      meshes.set(node.id, mesh);
      roles.set(node.id, role);
      group.add(mesh);
    }
    currentKey = g.key;
    applyTheme();
  }

  return {
    group,
    meshes,

    set(g, positions, revealedValues): void {
      if (g.key !== currentKey) rebuild(g);
      for (const [id, mesh] of meshes) {
        const [x, y, z] = wallPoint(positions, id);
        mesh.position.set(x, y, z);
        (mesh.material as MeshStandardMaterial).opacity = revealedValues.has(id) ? 1 : DIM_OPACITY;
      }
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      clear();
      bigGeometry.dispose();
      opGeometry.dispose();
    },
  };
}
