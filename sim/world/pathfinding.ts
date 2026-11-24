// A* pathfinding on the tile grid. Moves are 4-directional. Each tile has an entry cost (road is cheaper than grass).
import type { Point, TownMap } from "./map";

type Node = { x: number; y: number; f: number; order: number };

// Minimal binary min-heap ordered by f, then insertion order (so results are deterministic).
class MinHeap {
  private items: Node[] = [];
  get size() {
    return this.items.length;
  }
  private less(a: Node, b: Node) {
    return a.f < b.f || (a.f === b.f && a.order < b.order);
  }
  push(node: Node) {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(items[i], items[parent])) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }
  pop(): Node | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && this.less(items[l], items[smallest])) smallest = l;
        if (r < items.length && this.less(items[r], items[smallest])) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

const NEIGHBORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/**
 * Cheapest path from `start` to `goal`, as the tiles to step onto in order (start excluded, goal included).
 * Returns [] if start equals goal, and null if the goal cannot be reached.
 */
export function findPath(map: TownMap, start: Point, goal: Point): Point[] | null {
  if (!map.isWalkable(start.x, start.y) || !map.isWalkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const key = (x: number, y: number) => y * map.width + x;
  // The cheapest tile costs 1, so Manhattan distance never overestimates. That keeps A* optimal.
  const heuristic = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  const best = new Map<number, number>([[key(start.x, start.y), 0]]);
  const cameFrom = new Map<number, number>();
  const open = new MinHeap();
  let order = 0;
  open.push({ x: start.x, y: start.y, f: heuristic(start.x, start.y), order: order++ });

  while (open.size > 0) {
    const current = open.pop()!;
    const currentKey = key(current.x, current.y);
    const currentCost = best.get(currentKey)!;

    if (current.x === goal.x && current.y === goal.y) {
      const path: Point[] = [];
      let k = currentKey;
      while (k !== key(start.x, start.y)) {
        path.push({ x: k % map.width, y: Math.floor(k / map.width) });
        k = cameFrom.get(k)!;
      }
      return path.reverse();
    }

    // Skip stale heap entries (a cheaper route to this tile was found after this one was queued).
    if (current.f > currentCost + heuristic(current.x, current.y)) continue;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const stepCost = map.cost(nx, ny);
      if (stepCost === Infinity) continue;
      const newCost = currentCost + stepCost;
      const nk = key(nx, ny);
      if (newCost < (best.get(nk) ?? Infinity)) {
        best.set(nk, newCost);
        cameFrom.set(nk, currentKey);
        open.push({ x: nx, y: ny, f: newCost + heuristic(nx, ny), order: order++ });
      }
    }
  }
  return null;
}
