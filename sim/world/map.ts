
// Legend
//   .  grass (walkable, slow)        =  road (walkable, fast)        ,  park grass (walkable, fast)
//   #  tree (blocked)               ~  water (blocked)
//   H  house   B  bakery   S  smithy   T  tavern   M  town hall   (all blocked)
//   Doors are walkable and mark a location's entry point:
//   b bakery   s smithy   t tavern   m town hall   P park centre   1-5 homes
import type { LocationInfo } from "../protocol";

export const MAP_ROWS: string[] = [
  "################################",
  "#..............................#",
  "#.HHH..HHH..BBBB..SSSS..TTTTT..#",
  "#.HHH..HHH..BBBB..SSSS..TTTTT..#",
  "#.H1H..H2H..BBbB..SSsS..TTtTT..#",
  "#==============================#",
  "#..............................#",
  "#.,,,,,,,,,,,..................#",
  "#.,,,,,,,,,,,.....MMMMMMM......#",
  "#.,,,,,,,,,,,.....MMMMMMM......#",
  "#.,,,,,P,,,,,.....MMMmMMM......#",
  "#.,,,,,,,,,,,..................#",
  "#.,,,,,,,,,,,...~~~~~..........#",
  "#.,,,,,,,,,,,...~~~~~..........#",
  "#..............................#",
  "#..HHH....HHH...........HHH....#",
  "#..HHH....HHH...........HHH....#",
  "#..H3H....H4H...........H5H....#",
  "#==============================#",
  "################################",
];

export type Point = { x: number; y: number };

const DOORS: Record<string, Omit<LocationInfo, "x" | "y">> = {
  b: { id: "bakery", name: "Bakery", kind: "bakery" },
  s: { id: "smithy", name: "Smithy", kind: "smithy" },
  t: { id: "tavern", name: "Tavern", kind: "tavern" },
  m: { id: "townhall", name: "Town Hall", kind: "townhall" },
  P: { id: "park", name: "Park", kind: "park" },
  "1": { id: "home_maren", name: "Maren's house", kind: "home" },
  "2": { id: "home_dorrik", name: "Dorrik's house", kind: "home" },
  "3": { id: "home_ilsa", name: "Ilsa's house", kind: "home" },
  "4": { id: "home_tobias", name: "Tobias's house", kind: "home" },
  "5": { id: "home_edda", name: "Edda's house", kind: "home" },
};

const WALK_COST: Record<string, number> = { ".": 2, "=": 1, ",": 1 };
for (const door of Object.keys(DOORS)) WALK_COST[door] = 1;

export class TownMap {
  readonly width: number;
  readonly height: number;
  readonly locations: LocationInfo[];
  private readonly byId = new Map<string, LocationInfo>();

  constructor(readonly rows: string[] = MAP_ROWS) {
    this.height = rows.length;
    this.width = rows[0].length;
    for (const [y, row] of rows.entries()) {
      if (row.length !== this.width) throw new Error(`Map row ${y} has width ${row.length}, expected ${this.width}`);
    }

    const found: LocationInfo[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const door = DOORS[rows[y][x]];
        if (door) found.push({ ...door, x, y });
      }
    }
    for (const char of Object.keys(DOORS)) {
      const count = found.filter((l) => l.id === DOORS[char].id).length;
      if (count !== 1) throw new Error(`Map must contain exactly one "${char}" (${DOORS[char].id}), found ${count}`);
    }
    this.locations = found;
    for (const loc of found) this.byId.set(loc.id, loc);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  cost(x: number, y: number): number {
    if (!this.inBounds(x, y)) return Infinity;
    return WALK_COST[this.rows[y][x]] ?? Infinity;
  }

  isWalkable(x: number, y: number): boolean {
    return this.cost(x, y) !== Infinity;
  }

  location(id: string): LocationInfo {
    const loc = this.byId.get(id);
    if (!loc) throw new Error(`Unknown location "${id}"`);
    return loc;
  }
}
