/**
 * Unit tests for the amenity system (idle characters visiting interactive props).
 *
 * Covers:
 *   - buildAmenities: coffee furniture → amenity with front approach + facing
 *   - buildAmenities: non-amenity furniture yields nothing
 *   - buildAmenities: boxed-in furniture (no walkable approach) yields nothing
 *   - pickAmenity: nearest free reachable amenity; skips occupied
 *   - updateCharacter: idle → walk to coffee → hold with bubble → release
 *   - updateCharacter: becoming active abandons the visit and frees occupancy
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { afterEach, beforeEach, test } from 'vitest';

import { AMENITY_USE_MIN_SEC } from '../src/constants.js';
import {
  type AmenityContext,
  buildAmenities,
  pickAmenity,
} from '../src/office/engine/amenities.js';
import { updateCharacter } from '../src/office/engine/characters.js';
import type {
  Character,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

// ── Helpers ────────────────────────────────────────────────────

function buildOpenTileMap(cols: number, rows: number): TileTypeVal[][] {
  const map: TileTypeVal[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TileTypeVal[] = [];
    for (let c = 0; c < cols; c++) row.push(TileType.FLOOR_1 as TileTypeVal);
    map.push(row);
  }
  return map;
}

function buildWalkableTiles(cols: number, rows: number): Array<{ col: number; row: number }> {
  const tiles: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.push({ col: c, row: r });
  return tiles;
}

function makeChar(id: number, col: number, row: number): Character {
  return {
    id,
    state: CharacterState.IDLE,
    dir: Direction.DOWN,
    x: col * 16 + 8,
    y: row * 16 + 8,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette: 0,
    hueShift: 0,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: 5,
    isActive: false,
    seatId: null,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    amenityTarget: null,
    amenityTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    inputTokens: 0,
    outputTokens: 0,
  };
}

function coffee(uid: string, col: number, row: number): PlacedFurniture {
  return { uid, type: 'COFFEE', col, row };
}

const NO_SEATS = new Map<string, Seat>();

// Deterministic Math.random (returns 0 → visit roll always passes, randomRange → min).
const realRandom = Math.random;
beforeEach(() => {
  Math.random = () => 0;
});
afterEach(() => {
  Math.random = realRandom;
});

// ── buildAmenities ─────────────────────────────────────────────

test('buildAmenities: coffee machine becomes an amenity approached from the front (facing UP)', () => {
  const tileMap = buildOpenTileMap(5, 5);
  const list = buildAmenities([coffee('c1', 2, 1)], tileMap, new Set());
  assert.equal(list.length, 1);
  const a = list[0];
  assert.equal(a.uid, 'c1');
  assert.equal(a.activity, 'coffee');
  assert.equal(a.bubble, 'coffee');
  // 1x1 footprint at (2,1): front/below tile is (2,2), character there faces UP.
  assert.equal(a.col, 2);
  assert.equal(a.row, 2);
  assert.equal(a.facing, Direction.UP);
});

test('buildAmenities: non-amenity furniture yields nothing', () => {
  const tileMap = buildOpenTileMap(5, 5);
  const list = buildAmenities([{ uid: 'd1', type: 'DESK', col: 2, row: 2 }], tileMap, new Set());
  assert.equal(list.length, 0);
});

test('buildAmenities: boxed-in coffee (no walkable approach) yields nothing', () => {
  const tileMap = buildOpenTileMap(5, 5);
  const blocked = new Set<string>(['2,0', '2,2', '1,1', '3,1']); // all 4 neighbours of (2,1)
  const list = buildAmenities([coffee('c1', 2, 1)], tileMap, blocked);
  assert.equal(list.length, 0);
});

// ── pickAmenity ────────────────────────────────────────────────

test('pickAmenity: returns the nearest free reachable amenity', () => {
  const tileMap = buildOpenTileMap(9, 9);
  const list = buildAmenities([coffee('near', 1, 0), coffee('far', 7, 0)], tileMap, new Set());
  const ch = makeChar(1, 1, 4);
  const ctx: AmenityContext = { list, occupied: new Set() };
  const pick = pickAmenity(ch, ctx, tileMap, new Set());
  assert.ok(pick, 'expected a pick');
  assert.equal(pick!.amenity.uid, 'near');
  assert.ok(pick!.path.length > 0);
});

test('pickAmenity: skips amenities already occupied', () => {
  const tileMap = buildOpenTileMap(9, 9);
  const list = buildAmenities([coffee('near', 1, 0), coffee('far', 7, 0)], tileMap, new Set());
  const ch = makeChar(1, 1, 4);
  const ctx: AmenityContext = { list, occupied: new Set(['near']) };
  const pick = pickAmenity(ch, ctx, tileMap, new Set());
  assert.ok(pick, 'expected a pick');
  assert.equal(pick!.amenity.uid, 'far', 'occupied "near" is skipped');
});

// ── Full visit cycle through updateCharacter ───────────────────

test('updateCharacter: idle character walks to coffee, holds with bubble, then releases', () => {
  const tileMap = buildOpenTileMap(5, 5);
  const walkable = buildWalkableTiles(5, 5);
  const list = buildAmenities([coffee('c1', 2, 1)], tileMap, new Set()); // approach (2,2) UP
  const ctx: AmenityContext = { list, occupied: new Set() };
  const ch = makeChar(1, 2, 3); // one tile below the approach tile
  ch.wanderTimer = 0; // force a wander decision this tick

  // Tick 1: idle decision rolls the visit (Math.random=0 < AMENITY_VISIT_CHANCE) and claims it.
  updateCharacter(ch, 0.1, walkable, NO_SEATS, tileMap, new Set(), ctx);
  assert.equal(ch.state, CharacterState.WALK, 'should start walking to the amenity');
  assert.ok(ch.amenityTarget, 'amenity claimed');
  assert.equal(ch.amenityTarget!.uid, 'c1');
  assert.ok(ctx.occupied.has('c1'), 'occupancy recorded');

  // Walk until the use-hold begins (coffee bubble appears).
  let ticks = 0;
  while (ch.bubbleType !== 'coffee' && ticks < 40) {
    updateCharacter(ch, 0.2, walkable, NO_SEATS, tileMap, new Set(), ctx);
    ticks++;
  }
  assert.equal(ch.bubbleType, 'coffee', 'coffee bubble shows during the break');
  assert.equal(ch.state, CharacterState.IDLE, 'stands (idle) while using the amenity');
  assert.equal(ch.dir, Direction.UP, 'faces the coffee machine');
  assert.equal(ch.tileCol, 2);
  assert.equal(ch.tileRow, 2);
  assert.ok(ch.amenityTimer > 0, 'use timer running');
  assert.ok(ch.amenityTimer <= AMENITY_USE_MIN_SEC + 0.0001);

  // Exhaust the hold → release.
  updateCharacter(ch, AMENITY_USE_MIN_SEC + 1, walkable, NO_SEATS, tileMap, new Set(), ctx);
  assert.equal(ch.amenityTarget, null, 'amenity released');
  assert.equal(ch.amenityTimer, 0);
  assert.equal(ch.bubbleType, null, 'coffee bubble cleared');
  assert.ok(!ctx.occupied.has('c1'), 'occupancy freed');
  assert.equal(ch.wanderCount, 1, 'the break counts as a wander move toward the seat rest');
});

test('updateCharacter: an amenity visit is abandoned when the agent becomes active', () => {
  const tileMap = buildOpenTileMap(5, 5);
  const walkable = buildWalkableTiles(5, 5);
  const list = buildAmenities([coffee('c1', 2, 1)], tileMap, new Set());
  const ctx: AmenityContext = { list, occupied: new Set(['c1']) };
  const ch = makeChar(1, 2, 2);
  ch.amenityTarget = list[0];
  ch.amenityTimer = 3;
  ch.bubbleType = 'coffee';
  ch.isActive = true; // agent started working

  updateCharacter(ch, 0.1, walkable, NO_SEATS, tileMap, new Set(), ctx);
  assert.equal(ch.amenityTarget, null, 'visit abandoned');
  assert.equal(ch.amenityTimer, 0);
  assert.equal(ch.bubbleType, null, 'coffee bubble dropped');
  assert.ok(!ctx.occupied.has('c1'), 'occupancy freed');
});
