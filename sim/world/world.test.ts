// Run with: npm run test:sim
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMinute, parseMinute, timeAtTick } from "./clock";
import { TownMap } from "./map";
import { findPath } from "./pathfinding";
import { World } from "./world";

describe("map", () => {
  const map = new TownMap();

  it("has every location on a walkable tile", () => {
    for (const loc of map.locations) assert.ok(map.isWalkable(loc.x, loc.y), `${loc.id} is blocked`);
  });

  it("lets you walk between every pair of locations", () => {
    for (const a of map.locations) {
      for (const b of map.locations) {
        assert.notEqual(findPath(map, a, b), null, `${a.id} -> ${b.id} unreachable`);
      }
    }
  });

  it("rejects a map with ragged rows", () => {
    assert.throws(() => new TownMap(["###", "##"]), /width/);
  });
});

describe("findPath", () => {
  const map = new TownMap();

  it("returns an empty path when already there", () => {
    const bakery = map.location("bakery");
    assert.deepEqual(findPath(map, bakery, bakery), []);
  });

  it("returns null for a blocked goal and for an off-map goal", () => {
    const bakery = map.location("bakery");
    assert.equal(findPath(map, bakery, { x: 0, y: 0 }), null); // tree
    assert.equal(findPath(map, bakery, { x: 99, y: 99 }), null);
  });

  it("returns a connected walkable path that ends at the goal", () => {
    const from = map.location("home_maren");
    const to = map.location("tavern");
    const path = findPath(map, from, to)!;
    assert.ok(path.length > 0);
    assert.deepEqual(path.at(-1), { x: to.x, y: to.y });
    let prev = { x: from.x, y: from.y };
    for (const step of path) {
      assert.equal(Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y), 1, "steps must be adjacent");
      assert.ok(map.isWalkable(step.x, step.y));
      prev = step;
    }
  });

  it("detours onto the road when that is cheaper than walking across grass", () => {
    // Row 6 is grass (cost 2 per tile): straight from x=1 to x=30 costs 29 * 2 = 58.
    // Row 5 above it is road (cost 1): up (1) + 29 along the road + down onto grass (2) = 32.
    const path = findPath(map, { x: 1, y: 6 }, { x: 30, y: 6 })!;
    const onRoad = path.filter((p) => p.y === 5).length;
    assert.ok(onRoad >= 28, `expected most of the walk on the road row, got ${onRoad} road tiles`);
  });
});

describe("clock", () => {
  it("formats and parses HH:MM", () => {
    assert.equal(formatMinute(5), "00:05");
    assert.equal(formatMinute(13 * 60 + 30), "13:30");
    assert.equal(parseMinute("07:30"), 450);
    assert.throws(() => parseMinute("25:00"));
    assert.throws(() => parseMinute("noon"));
  });

  it("starts at 05:00 on day 1 and rolls over to day 2", () => {
    assert.deepEqual(timeAtTick(0), { day: 1, minuteOfDay: 300, text: "05:00" });
    assert.deepEqual(timeAtTick(19 * 60), { day: 2, minuteOfDay: 0, text: "00:00" });
  });
});

describe("world", () => {
  function run(world: World, ticks: number) {
    for (let i = 0; i < ticks; i++) world.step();
  }

  it("starts with every agent at home", () => {
    const world = new World();
    for (const a of world.agents) {
      const home = world.map.location(a.spec.homeId);
      assert.deepEqual({ x: a.x, y: a.y }, { x: home.x, y: home.y });
    }
  });

  it("gets Maren to the bakery by 08:00, and she is no longer walking", () => {
    const world = new World();
    run(world, 3 * 60); // 05:00 -> 08:00
    const maren = world.agents.find((a) => a.spec.id === "maren")!;
    const bakery = world.map.location("bakery");
    assert.deepEqual({ x: maren.x, y: maren.y }, { x: bakery.x, y: bakery.y });
    assert.equal(maren.walking, false);
    assert.equal(maren.state().activity, "At Bakery");
  });

  it("moves at most one tile per tick", () => {
    const world = new World();
    let before = world.agents.map((a) => ({ x: a.x, y: a.y }));
    for (let i = 0; i < 24 * 60; i++) {
      world.step();
      world.agents.forEach((a, n) => {
        assert.ok(Math.abs(a.x - before[n].x) + Math.abs(a.y - before[n].y) <= 1);
      });
      before = world.agents.map((a) => ({ x: a.x, y: a.y }));
    }
  });

  it("has everyone home again by 04:00 the next day", () => {
    const world = new World();
    run(world, 23 * 60); // 05:00 -> 04:00 next day
    assert.equal(world.stateMessage({ running: false, speed: 1 }).time, "04:00");
    for (const a of world.agents) {
      const home = world.map.location(a.spec.homeId);
      assert.deepEqual({ x: a.x, y: a.y }, { x: home.x, y: home.y }, `${a.spec.name} is not home`);
    }
  });

  it("is deterministic", () => {
    const a = new World();
    const b = new World();
    run(a, 1000);
    run(b, 1000);
    assert.deepEqual(a.stateMessage({ running: false, speed: 1 }), b.stateMessage({ running: false, speed: 1 }));
  });
});
