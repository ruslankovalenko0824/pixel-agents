import { getCatalogEntry } from '../layout/furnitureCatalog.js';
import { findPath, isWalkable } from '../layout/tileMap.js';
import type {
  Amenity,
  AmenityActivity,
  Character,
  PlacedFurniture,
  TileType as TileTypeVal,
} from '../types.js';
import { Direction } from '../types.js';

/**
 * Runtime amenity state passed into the character FSM each tick.
 * `list` is rebuilt from the layout; `occupied` (keyed by amenity uid) persists
 * across ticks so two characters never claim the same prop.
 */
export interface AmenityContext {
  list: Amenity[];
  occupied: Set<string>;
}

/**
 * Maps a placed-furniture asset type → the amenity it offers. This registry is
 * the single place to extend the system: add a row to turn any existing
 * furniture into something idle characters walk over to and use.
 */
const AMENITY_SPECS: Record<string, { activity: AmenityActivity; bubble: 'coffee' }> = {
  COFFEE: { activity: 'coffee', bubble: 'coffee' },
};

/** A walkable approach tile adjacent to a footprint, plus the facing toward it. */
interface Approach {
  col: number;
  row: number;
  facing: Direction;
}

/**
 * Find a walkable tile next to a furniture footprint, preferring the front
 * (below) then the sides then the top. Returns the tile and the direction a
 * character standing there faces to look at the furniture, or null if boxed in.
 */
function findApproach(
  col: number,
  row: number,
  w: number,
  h: number,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): Approach | null {
  const candidates: Approach[] = [];
  // Front / below → face UP
  for (let c = col; c < col + w; c++)
    candidates.push({ col: c, row: row + h, facing: Direction.UP });
  // Left → face RIGHT
  for (let r = row; r < row + h; r++)
    candidates.push({ col: col - 1, row: r, facing: Direction.RIGHT });
  // Right → face LEFT
  for (let r = row; r < row + h; r++)
    candidates.push({ col: col + w, row: r, facing: Direction.LEFT });
  // Back / above → face DOWN
  for (let c = col; c < col + w; c++)
    candidates.push({ col: c, row: row - 1, facing: Direction.DOWN });

  for (const cand of candidates) {
    if (isWalkable(cand.col, cand.row, tileMap, blockedTiles)) return cand;
  }
  return null;
}

/**
 * Build the amenity list from placed furniture. Each entry that matches
 * AMENITY_SPECS and has a reachable approach tile becomes one Amenity.
 */
export function buildAmenities(
  furniture: PlacedFurniture[],
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): Amenity[] {
  const out: Amenity[] = [];
  for (const f of furniture) {
    const spec = AMENITY_SPECS[f.type];
    if (!spec) continue;
    const entry = getCatalogEntry(f.type);
    const w = entry?.footprintW ?? 1;
    const h = entry?.footprintH ?? 1;
    const approach = findApproach(f.col, f.row, w, h, tileMap, blockedTiles);
    if (!approach) continue;
    out.push({
      uid: f.uid,
      activity: spec.activity,
      col: approach.col,
      row: approach.row,
      facing: approach.facing,
      bubble: spec.bubble,
    });
  }
  return out;
}

/**
 * Pick the nearest free amenity a character can actually path to. Returns the
 * amenity plus the path to its approach tile, or null when none is reachable.
 * Does not mutate occupancy — the caller claims the amenity on success.
 */
export function pickAmenity(
  ch: Character,
  ctx: AmenityContext,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): { amenity: Amenity; path: Array<{ col: number; row: number }> } | null {
  const free = ctx.list
    .filter((a) => !ctx.occupied.has(a.uid))
    .map((a) => ({
      a,
      d: Math.abs(a.col - ch.tileCol) + Math.abs(a.row - ch.tileRow),
    }))
    .sort((x, y) => x.d - y.d);

  for (const { a } of free) {
    const path = findPath(ch.tileCol, ch.tileRow, a.col, a.row, tileMap, blockedTiles);
    if (path.length > 0) return { amenity: a, path };
  }
  return null;
}
