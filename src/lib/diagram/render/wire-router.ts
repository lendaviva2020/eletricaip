// Pure Orthogonal Wire Router, Crossing/Junction Analyzer & Content Bounds Calculator
// Shared between DiagramStage (Pixi), AutoLayoutRouter, and Viewport Fit-to-View.

import type { DiagramEdge, DiagramNode, NodeKind } from "../schema";
import type { PortSide } from "./ports";

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DiagramBounds extends BoundingBox {
  centerX: number;
  centerY: number;
  validNodeCount: number;
}

export interface CrossingPoint {
  edgeId: string;
  x: number;
  y: number;
}

export interface JunctionPoint {
  x: number;
  y: number;
}

const VALID_COORD_LIMIT = 500_000;
const DEFAULT_STUB = 18;
const OBSTACLE_MARGIN = 16;

export function isValidCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= VALID_COORD_LIMIT;
}

/**
 * Estimates visual bounding box of a DiagramNode including symbol body and rendered text label.
 */
export function computeNodeBoundingBox(node: DiagramNode): BoundingBox {
  const kind: NodeKind = node.params.kind;
  const x = node.position.x;
  const y = node.position.y;

  let halfW = 30;
  let topH = 24;
  let botH = 42;

  if (kind === "busbar") {
    halfW = 66;
    topH = 12;
    botH = 38;
  } else if (
    kind === "plc" ||
    kind === "hmi" ||
    kind === "transformer" ||
    kind === "ccm" ||
    kind === "vfd" ||
    kind === "softstarter" ||
    kind === "generator"
  ) {
    halfW = 36;
    topH = 26;
    botH = 44;
  }

  const labelLen = (node.label || kind).length;
  const labelHalfW = Math.min(84, Math.max(halfW, labelLen * 3.4));
  const effHalfW = Math.max(halfW, labelHalfW);

  const minX = x - effHalfW;
  const minY = y - topH;
  const maxX = x + effHalfW;
  const maxY = y + botH;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Computes real content bounding box from valid nodes (symbols + labels) and valid edge waypoints.
 * Ignores corrupted, NaN, Infinite, or extreme outlier sentinel coordinates.
 */
export function computeDiagramBounds(
  nodes: ReadonlyArray<DiagramNode>,
  edges: ReadonlyArray<DiagramEdge> = [],
): DiagramBounds | null {
  const validNodeIds = new Set<string>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    if (!n?.position || !isValidCoord(n.position.x) || !isValidCoord(n.position.y)) continue;
    validNodeIds.add(n.id);
    const box = computeNodeBoundingBox(n);
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }

  if (validNodeIds.size === 0) return null;

  for (const e of edges) {
    if (!validNodeIds.has(e.source) && !validNodeIds.has(e.target)) continue;
    if (!e.waypoints) continue;
    for (const wp of e.waypoints) {
      if (!wp || !isValidCoord(wp.x) || !isValidCoord(wp.y)) continue;
      minX = Math.min(minX, wp.x - 8);
      minY = Math.min(minY, wp.y - 8);
      maxX = Math.max(maxX, wp.x + 8);
      maxY = Math.max(maxY, wp.y + 8);
    }
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    validNodeCount: validNodeIds.size,
  };
}

function sideDir(side: PortSide): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 1 };
  }
}

function isHorizontalSide(side: PortSide): boolean {
  return side === "left" || side === "right";
}

function isVerticalSide(side: PortSide): boolean {
  return side === "top" || side === "bottom";
}

function segmentIntersectsBox(a: Point, b: Point, box: BoundingBox): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return maxX > box.minX && minX < box.maxX && maxY > box.minY && minY < box.maxY;
}

function pathHitsAnyObstacle(pts: ReadonlyArray<Point>, obstacles: ReadonlyArray<BoundingBox>): boolean {
  if (obstacles.length === 0) return false;
  for (let i = 0; i < pts.length - 1; i++) {
    for (const obs of obstacles) {
      if (segmentIntersectsBox(pts[i], pts[i + 1], obs)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Normalizes a point list into strictly orthogonal horizontal/vertical segments,
 * collapsing collinear points and zero-length steps.
 */
export function simplifyOrthogonalPoints(raw: ReadonlyArray<Point>): Point[] {
  if (raw.length === 0) return [];
  const ortho: Point[] = [{ x: raw[0].x, y: raw[0].y }];

  for (let i = 1; i < raw.length; i++) {
    const prev = ortho[ortho.length - 1];
    const cur = raw[i];
    if (!isValidCoord(cur.x) || !isValidCoord(cur.y)) continue;
    if (Math.abs(prev.x - cur.x) < 0.5 && Math.abs(prev.y - cur.y) < 0.5) continue;

    if (Math.abs(prev.x - cur.x) >= 0.5 && Math.abs(prev.y - cur.y) >= 0.5) {
      // Repair non-orthogonal jump cleanly
      ortho.push({ x: cur.x, y: prev.y });
    }
    ortho.push({ x: cur.x, y: cur.y });
  }

  // Collapse collinear intermediates
  const cleaned: Point[] = [];
  for (const pt of ortho) {
    cleaned.push(pt);
    while (cleaned.length >= 3) {
      const a = cleaned[cleaned.length - 3];
      const b = cleaned[cleaned.length - 2];
      const c = cleaned[cleaned.length - 1];
      const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
      const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
      if (sameX || sameY) {
        cleaned.splice(cleaned.length - 2, 1);
      } else {
        break;
      }
    }
  }
  return cleaned;
}

/**
 * Checks whether an existing persisted waypoint polyline still attaches cleanly
 * to `from` and `to` and can be updated smoothly while preserving manual interior legs.
 */
function adaptExistingWaypoints(from: Point, to: Point, existing: ReadonlyArray<Point>): Point[] | null {
  if (existing.length < 3) return null;
  for (const pt of existing) {
    if (!isValidCoord(pt.x) || !isValidCoord(pt.y)) return null;
  }

  // If endpoints moved very far from stored waypoints (> 180px), recompute fresh route
  const startDist = Math.hypot(existing[0].x - from.x, existing[0].y - from.y);
  const endDist = Math.hypot(
    existing[existing.length - 1].x - to.x,
    existing[existing.length - 1].y - to.y,
  );
  if (startDist > 180 || endDist > 180) return null;

  const pts = existing.map((p) => ({ x: p.x, y: p.y }));
  const firstHorizontal = Math.abs(pts[0].y - pts[1].y) < 0.5;
  const lastHorizontal = Math.abs(pts[pts.length - 2].y - pts[pts.length - 1].y) < 0.5;

  pts[0] = { x: from.x, y: from.y };
  if (firstHorizontal) {
    pts[1] = { x: pts[1].x, y: from.y };
  } else {
    pts[1] = { x: from.x, y: pts[1].y };
  }

  const lastIdx = pts.length - 1;
  pts[lastIdx] = { x: to.x, y: to.y };
  if (lastHorizontal) {
    pts[lastIdx - 1] = { x: pts[lastIdx - 1].x, y: to.y };
  } else {
    pts[lastIdx - 1] = { x: to.x, y: pts[lastIdx - 1].y };
  }

  return simplifyOrthogonalPoints(pts);
}

/**
 * Generates an obstacle-aware strictly orthogonal polyline between two ports.
 */
export function routeOrthogonalEdge(params: {
  from: Point;
  to: Point;
  srcSide?: PortSide;
  tgtSide?: PortSide;
  obstacles?: ReadonlyArray<BoundingBox>;
  existingWaypoints?: ReadonlyArray<Point>;
}): Point[] {
  const {
    from,
    to,
    srcSide = "bottom",
    tgtSide = "top",
    obstacles = [],
    existingWaypoints,
  } = params;

  if (existingWaypoints && existingWaypoints.length >= 2) {
    const adapted = adaptExistingWaypoints(from, to, existingWaypoints);
    if (adapted && adapted.length >= 2) return adapted;
  }

  // Self-loop / degenerate
  if (Math.hypot(from.x - to.x, from.y - to.y) < 1) {
    return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
  }

  const sDir = sideDir(srcSide);
  const tDir = sideDir(tgtSide);
  const p1 = { x: from.x + sDir.x * DEFAULT_STUB, y: from.y + sDir.y * DEFAULT_STUB };
  const p2 = { x: to.x + tDir.x * DEFAULT_STUB, y: to.y + tDir.y * DEFAULT_STUB };

  // Build candidate orthogonal paths ranked by simplicity & cleanliness
  const candidates: Point[][] = [];

  if (isVerticalSide(srcSide) && isVerticalSide(tgtSide)) {
    const alignedDown = srcSide === "bottom" && tgtSide === "top" && to.y >= from.y;
    const alignedUp = srcSide === "top" && tgtSide === "bottom" && to.y <= from.y;

    if ((alignedDown || alignedUp) && Math.abs(from.x - to.x) < 1) {
      candidates.push([from, to]);
    }

    if (alignedDown || alignedUp) {
      const midY = (from.y + to.y) / 2;
      candidates.push([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]);
    }

    // Side channel detour around obstacles if vertical direct or midY crosses something
    const sideOffsets = [80, -80, 140, -140, 220, -220];
    const baseMinX = Math.min(from.x, to.x);
    const baseMaxX = Math.max(from.x, to.x);
    for (const dx of sideOffsets) {
      const laneX = dx > 0 ? baseMaxX + dx : baseMinX + dx;
      candidates.push([
        from,
        p1,
        { x: laneX, y: p1.y },
        { x: laneX, y: p2.y },
        p2,
        to,
      ]);
    }
  } else if (isHorizontalSide(srcSide) && isHorizontalSide(tgtSide)) {
    const alignedRight = srcSide === "right" && tgtSide === "left" && to.x >= from.x;
    const alignedLeft = srcSide === "left" && tgtSide === "right" && to.x <= from.x;

    if ((alignedRight || alignedLeft) && Math.abs(from.y - to.y) < 1) {
      candidates.push([from, to]);
    }

    if (alignedRight || alignedLeft) {
      const midX = (from.x + to.x) / 2;
      candidates.push([from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]);
    }

    const sideOffsets = [80, -80, 140, -140];
    const baseMinY = Math.min(from.y, to.y);
    const baseMaxY = Math.max(from.y, to.y);
    for (const dy of sideOffsets) {
      const laneY = dy > 0 ? baseMaxY + dy : baseMinY + dy;
      candidates.push([
        from,
        p1,
        { x: p1.x, y: laneY },
        { x: p2.x, y: laneY },
        p2,
        to,
      ]);
    }
  } else if (isVerticalSide(srcSide) && isHorizontalSide(tgtSide)) {
    // Clean L-turn or stubbed Z
    const corner = { x: from.x, y: to.y };
    if (
      (srcSide === "bottom" && to.y >= from.y) ||
      (srcSide === "top" && to.y <= from.y)
    ) {
      candidates.push([from, corner, to]);
    }
    candidates.push([from, p1, { x: p2.x, y: p1.y }, p2, to]);
    candidates.push([from, p1, { x: p1.x, y: p2.y }, p2, to]);
  } else if (isHorizontalSide(srcSide) && isVerticalSide(tgtSide)) {
    const corner = { x: to.x, y: from.y };
    if (
      (srcSide === "right" && to.x >= from.x) ||
      (srcSide === "left" && to.x <= from.x)
    ) {
      candidates.push([from, corner, to]);
    }
    candidates.push([from, p1, { x: p1.x, y: p2.y }, p2, to]);
    candidates.push([from, p1, { x: p2.x, y: p1.y }, p2, to]);
  } else {
    const midY = (from.y + to.y) / 2;
    candidates.push([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]);
  }

  // Pad obstacles slightly for clearance
  const padded = obstacles.map((o) => ({
    minX: o.minX - OBSTACLE_MARGIN * 0.5,
    minY: o.minY - OBSTACLE_MARGIN * 0.5,
    maxX: o.maxX + OBSTACLE_MARGIN * 0.5,
    maxY: o.maxY + OBSTACLE_MARGIN * 0.5,
    width: o.width + OBSTACLE_MARGIN,
    height: o.height + OBSTACLE_MARGIN,
  }));

  for (const cand of candidates) {
    const pts = simplifyOrthogonalPoints(cand);
    if (pts.length >= 2 && !pathHitsAnyObstacle(pts, padded)) {
      return pts;
    }
  }

  // Fallback to simplest candidate if every route intersects crowded boxes
  const fallback = candidates[0] ?? [from, { x: from.x, y: (from.y + to.y) / 2 }, { x: to.x, y: (from.y + to.y) / 2 }, to];
  return simplifyOrthogonalPoints(fallback);
}

/**
 * Analyzes rendered orthogonal polylines on a sheet to compute:
 * - explicit electrical junction dots (shared ports / busbar taps / >=2 connected conductors)
 * - non-connecting orthogonal crossing points (bridge jump arcs on horizontal segments)
 */
export function computeEdgeAnnotations(
  edgesData: ReadonlyArray<{
    id: string;
    source: string;
    sourcePort?: string;
    target: string;
    targetPort?: string;
    isBusbarTap?: boolean;
    busbarPoint?: Point;
    points: ReadonlyArray<Point>;
  }>,
): { junctions: JunctionPoint[]; crossingsByEdge: Map<string, CrossingPoint[]> } {
  const junctions: JunctionPoint[] = [];
  const crossingsByEdge = new Map<string, CrossingPoint[]>();

  // 1. Track how many edges connect to each (nodeId, portKey) or terminal point
  const portUseCount = new Map<string, { count: number; pt: Point; isBusbar: boolean }>();
  const addPortUse = (key: string, pt: Point, isBusbar: boolean) => {
    const prev = portUseCount.get(key);
    if (prev) {
      prev.count += 1;
      prev.isBusbar = prev.isBusbar || isBusbar;
    } else {
      portUseCount.set(key, { count: 1, pt, isBusbar });
    }
  };

  for (const e of edgesData) {
    if (e.points.length < 2) continue;
    const startPt = e.points[0];
    const endPt = e.points[e.points.length - 1];
    const sKey = `${e.source}:${e.sourcePort ?? "default"}@${Math.round(startPt.x)},${Math.round(startPt.y)}`;
    const tKey = `${e.target}:${e.targetPort ?? "default"}@${Math.round(endPt.x)},${Math.round(endPt.y)}`;
    addPortUse(sKey, startPt, Boolean(e.isBusbarTap && e.busbarPoint && Math.hypot(e.busbarPoint.x - startPt.x, e.busbarPoint.y - startPt.y) < 2));
    addPortUse(tKey, endPt, Boolean(e.isBusbarTap && e.busbarPoint && Math.hypot(e.busbarPoint.x - endPt.x, e.busbarPoint.y - endPt.y) < 2));
  }

  for (const entry of portUseCount.values()) {
    if (entry.isBusbar || entry.count >= 2) {
      junctions.push(entry.pt);
    }
  }

  // 2. Non-connecting orthogonal crossings (skip if dataset is huge to stay O(1)-feel interactive)
  if (edgesData.length <= 250) {
    type Seg = { edgeId: string; x1: number; y1: number; x2: number; y2: number; src: string; tgt: string };
    const horiz: Seg[] = [];
    const vert: Seg[] = [];

    for (const e of edgesData) {
      for (let i = 0; i < e.points.length - 1; i++) {
        const a = e.points[i];
        const b = e.points[i + 1];
        if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 12) {
          horiz.push({
            edgeId: e.id,
            x1: Math.min(a.x, b.x),
            x2: Math.max(a.x, b.x),
            y1: a.y,
            y2: a.y,
            src: e.source,
            tgt: e.target,
          });
        } else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 12) {
          vert.push({
            edgeId: e.id,
            x1: a.x,
            x2: a.x,
            y1: Math.min(a.y, b.y),
            y2: Math.max(a.y, b.y),
            src: e.source,
            tgt: e.target,
          });
        }
      }
    }

    for (const h of horiz) {
      for (const v of vert) {
        if (h.edgeId === v.edgeId) continue;
        // Skip crossings at a shared endpoint (already joined electrically)
        if (
          v.x1 > h.x1 + 6 &&
          v.x1 < h.x2 - 6 &&
          h.y1 > v.y1 + 6 &&
          h.y1 < v.y2 - 6
        ) {
          const list = crossingsByEdge.get(h.edgeId) ?? [];
          list.push({ edgeId: h.edgeId, x: v.x1, y: h.y1 });
          crossingsByEdge.set(h.edgeId, list);
        }
      }
    }
  }

  return { junctions, crossingsByEdge };
}

function distToSegmentSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) ** 2 + (py - projY) ** 2;
}

export function createPolylineHitArea(points: ReadonlyArray<Point>, tolerance: number) {
  const tol2 = tolerance * tolerance;
  return {
    contains: (x: number, y: number) => {
      for (let i = 0; i < points.length - 1; i++) {
        const d2 = distToSegmentSquared(
          x,
          y,
          points[i].x,
          points[i].y,
          points[i + 1].x,
          points[i + 1].y,
        );
        if (d2 <= tol2) return true;
      }
      return false;
    },
  };
}
