import { BufferGeometry, Float32BufferAttribute, type Mesh } from "three";
import { clipPolygonToRect } from "./clipPolygonToRect";
import { buildFloorBands, type Axis, type FacadeId, type FloorBand } from "../data/wallRegions";

type Pt = [number, number];

// Ngưỡng tích vô hướng giữa pháp tuyến tam giác và hướng ra ngoài của 1 mặt
// nhà — tam giác phải hướng gần đúng ra mặt đó mới được tính (loại các tam
// giác xiên như má cửa sổ, mép mái...).
const NORMAL_MATCH_THRESHOLD = 0.75;

// Khoảng hở tối thiểu (m) giữa 2 toạ độ mặt phẳng để coi là 2 mặt tường
// TÁCH RIÊNG (gấp khúc — vd tường lùi vào phía trong ban công) thay vì cùng
// 1 mặt phẳng. Sai số dựng mesh thường rất nhỏ (<5cm) nên ngưỡng này đủ lớn
// để không tách nhầm, nhưng đủ nhỏ để tách đúng các chỗ lùi/lồi thật.
const DEPTH_CLUSTER_GAP = 0.25;

// Diện tích tối thiểu (m²) để 1 cụm được coi là 1 mặt tường thật, đáng tách
// riêng theo độ sâu. Các chi tiết nhỏ (gờ, má cửa...) thường tạo ra cụm diện
// tích rất nhỏ dù cách xa mặt chính hơn DEPTH_CLUSTER_GAP — gộp các cụm này
// vào cụm liền kề gần nhất thay vì tính là 1 mặt phẳng riêng (khảo sát thực
// tế trên model: mặt phẳng thật luôn > 0.5m², mảnh vỡ hình học < 0.2m²).
const MIN_REGION_AREA = 0.35;

// Kích thước ô lưới (m) khi dò hình dạng thật của 1 mặt phẳng để chia thành
// các hình chữ nhật con (xem decomposeIntoRectangles).
const RECT_CELL_SIZE = 0.12;

const RECT_SUFFIX_LETTERS = "abcdefghijklmnopqrstuvwxyz";

interface FacadeDirection {
  id: FacadeId;
  name: string;
  axis: Axis;
  normalSign: 1 | -1;
}

const FACADE_DIRECTIONS: FacadeDirection[] = [
  { id: "A", name: "Mặt trước (cửa chính)", axis: "x", normalSign: 1 },
  { id: "B", name: "Mặt bên trái", axis: "z", normalSign: 1 },
  { id: "C", name: "Mặt sau", axis: "x", normalSign: -1 },
  { id: "D", name: "Mặt bên phải", axis: "z", normalSign: -1 },
];

export interface WallRegion {
  id: string; // vd "A1", "A2a", "A2b", hoặc "D1-2a" khi mặt vừa gấp khúc vừa chia hình chữ nhật
  facadeId: FacadeId;
  facadeName: string;
  bandIndex: 1 | 2 | 3;
  bandLabel: string;
  axis: Axis;
  normalSign: 1 | -1;
  /** Vị trí trung tâm (world space) để đặt nhãn hover/chọn. */
  center: [number, number, number];
  /** Đỉnh tam giác THẬT (chưa đẩy offset), đã fan-triangulate, dùng chung cho cả lớp phủ tô màu và hotspot hover. */
  rawPositions: Float32Array;
}

function readVec3(attr: ReturnType<BufferGeometry["getAttribute"]>, i: number): [number, number, number] {
  return [attr.getX(i), attr.getY(i), attr.getZ(i)];
}

function polygonArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
}

function pointInPolygon(poly: Pt[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface RectRegion {
  uMin: number;
  uMax: number;
  yMin: number;
  yMax: number;
}

/**
 * Chia hình dạng thật của 1 mặt phẳng tường (hợp của các đa giác tam giác đã
 * cắt theo tầng, có thể khuyết chỗ cửa sổ/cửa đi) thành SỐ ÍT NHẤT hình chữ
 * nhật trục-thẳng, ƯU TIÊN hình chữ nhật NGANG (rộng) trước: dò hình dạng
 * trên 1 lưới ô vuông rồi tham lam chọn hình chữ nhật lớn nhất mỗi vòng lặp
 * (mở rộng theo chiều ngang trước, rồi mới theo chiều dọc — nên khi diện
 * tích bằng nhau, hình rộng hơn luôn được ưu tiên). Mặt phẳng liền khối,
 * không lỗ sẽ luôn ra đúng 1 hình chữ nhật (không chia vụn).
 */
function decomposeIntoRectangles(polygons: Pt[][], cellSize: number): RectRegion[] {
  let uMin = Infinity;
  let uMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const poly of polygons) {
    for (const [u, y] of poly) {
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  if (!isFinite(uMin) || uMax - uMin < 1e-6 || yMax - yMin < 1e-6) return [];

  const cols = Math.max(1, Math.round((uMax - uMin) / cellSize));
  const rows = Math.max(1, Math.round((yMax - yMin) / cellSize));
  const cellW = (uMax - uMin) / cols;
  const cellH = (yMax - yMin) / rows;

  // Bbox từng đa giác, để lọc nhanh trước khi test điểm-trong-đa-giác (đa số
  // tam giác chỉ chiếm 1 phần nhỏ của cả vùng).
  const bboxes = polygons.map((poly) => {
    let pu0 = Infinity;
    let pu1 = -Infinity;
    let pv0 = Infinity;
    let pv1 = -Infinity;
    for (const [u, v] of poly) {
      if (u < pu0) pu0 = u;
      if (u > pu1) pu1 = u;
      if (v < pv0) pv0 = v;
      if (v > pv1) pv1 = v;
    }
    return [pu0, pu1, pv0, pv1] as [number, number, number, number];
  });

  const occ = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const cy = yMin + (r + 0.5) * cellH;
    for (let c = 0; c < cols; c++) {
      const cu = uMin + (c + 0.5) * cellW;
      for (let pi = 0; pi < polygons.length; pi++) {
        const [pu0, pu1, pv0, pv1] = bboxes[pi];
        if (cu < pu0 || cu > pu1 || cy < pv0 || cy > pv1) continue;
        if (pointInPolygon(polygons[pi], cu, cy)) {
          occ[r * cols + c] = 1;
          break;
        }
      }
    }
  }

  const used = new Uint8Array(cols * rows);
  const rects: RectRegion[] = [];
  for (;;) {
    let bestC0 = -1;
    let bestR0 = -1;
    let bestC1 = -1;
    let bestR1 = -1;
    let bestArea = 0;
    let bestWidth = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occ[r * cols + c] || used[r * cols + c]) continue;
        let c1 = c;
        while (c1 + 1 < cols && occ[r * cols + c1 + 1] && !used[r * cols + c1 + 1]) c1++;
        let r1 = r;
        rowGrow: while (r1 + 1 < rows) {
          for (let cc = c; cc <= c1; cc++) {
            if (!occ[(r1 + 1) * cols + cc] || used[(r1 + 1) * cols + cc]) break rowGrow;
          }
          r1++;
        }
        const width = c1 - c + 1;
        const area = width * (r1 - r + 1);
        if (area > bestArea || (area === bestArea && width > bestWidth)) {
          bestArea = area;
          bestWidth = width;
          bestC0 = c;
          bestR0 = r;
          bestC1 = c1;
          bestR1 = r1;
        }
      }
    }
    if (bestArea === 0) break;
    for (let r = bestR0; r <= bestR1; r++) {
      for (let c = bestC0; c <= bestC1; c++) used[r * cols + c] = 1;
    }
    rects.push({
      uMin: uMin + bestC0 * cellW,
      uMax: uMin + (bestC1 + 1) * cellW,
      yMin: yMin + bestR0 * cellH,
      yMax: yMin + (bestR1 + 1) * cellH,
    });
  }
  return rects;
}

/** Gắn id cho từng hình chữ nhật con — giữ nguyên id gốc nếu mặt phẳng không cần chia (chỉ 1 hình chữ nhật). */
function assignRectIds(baseId: string, rects: RectRegion[]): Array<{ id: string; rect: RectRegion }> {
  if (rects.length <= 1) return rects.map((rect) => ({ id: baseId, rect }));
  const ordered = [...rects].sort((a, b) => b.yMax - a.yMax || a.uMin - b.uMin);
  return ordered.map((rect, i) => ({ id: `${baseId}${RECT_SUFFIX_LETTERS[i] ?? `r${i + 1}`}`, rect }));
}

interface PendingFragment {
  facade: FacadeDirection;
  band: FloorBand;
  avgConst: number; // toạ độ trục pháp tuyến (trung bình 3 đỉnh tam giác gốc)
  points: Pt[]; // đa giác đã cắt theo tầng, hệ (u, y)
}

/**
 * Quét toàn bộ tam giác của các mesh nguồn (thân nhà chính dùng vertex
 * color, VÀ các mesh vật liệu riêng như gạch ốp phòng sân thượng — xem
 * `findWallRegionMeshes`), gộp các tam giác CÙNG hướng mặt ngoài (A/B/C/D,
 * dựa theo pháp tuyến THẬT trong model) và CÙNG tầng, tách tiếp theo ĐỘ SÂU
 * (nếu trong cùng 1 mặt + 1 tầng có 2 nhóm toạ độ cách nhau rõ rệt — vd
 * tường chính và tường lùi vào phía trong ban công — mỗi nhóm thành 1 mặt
 * phẳng riêng, hậu tố "-2", "-3"...), rồi chia tiếp MỖI mặt phẳng thành số
 * ít nhất hình chữ nhật (ưu tiên hình chữ nhật ngang, hậu tố chữ cái "a",
 * "b"...) để vùng tường quanh cửa sổ/cửa đi/bậc tam cấp... đều tách ra
 * chọn/tô màu riêng được thay vì gộp hết vào 1 vùng duy nhất.
 */
export function extractWallRegions(wallMeshes: Mesh[], maxY: number): WallRegion[] {
  const bands = buildFloorBands(maxY);

  // Tâm mặt bằng (X/Z) của toàn bộ khối tường (gộp mọi mesh nguồn) — dùng để
  // loại các tam giác mặt TRONG (vd mặt sau của chính bức tường đó, pháp
  // tuyến chĩa ngược vào trong nhà). Mesh dựng từ SketchUp thường có cả 2
  // mặt (ngoài + trong) cho mỗi bức tường; mặt trong của tường D (pháp
  // tuyến +Z, ngược hướng D) lại vô tình khớp tiêu chí pháp tuyến của mặt B
  // — nên chỉ xét normal không đủ, phải kiểm tra thêm vị trí có nằm đúng
  // "nửa" của mặt đó hay không.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const wallMesh of wallMeshes) {
    const pos = wallMesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const pending: PendingFragment[] = [];

  for (const wallMesh of wallMeshes) {
    const geom = wallMesh.geometry;
    const pos = geom.getAttribute("position");
    const normalAttr = geom.getAttribute("normal");
    const index = geom.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const getIndex = (i: number) => (index ? index.getX(i) : i);

    for (let t = 0; t < triCount; t++) {
      const i0 = getIndex(t * 3);
      const i1 = getIndex(t * 3 + 1);
      const i2 = getIndex(t * 3 + 2);

      const n0 = readVec3(normalAttr, i0);
      const n1 = readVec3(normalAttr, i1);
      const n2 = readVec3(normalAttr, i2);
      const avgNormal: [number, number, number] = [
        (n0[0] + n1[0] + n2[0]) / 3,
        (n0[1] + n1[1] + n2[1]) / 3,
        (n0[2] + n1[2] + n2[2]) / 3,
      ];

      const p0 = readVec3(pos, i0);
      const p1 = readVec3(pos, i1);
      const p2 = readVec3(pos, i2);

      let facade: FacadeDirection | null = null;
      for (const candidate of FACADE_DIRECTIONS) {
        const axisVal = candidate.axis === "x" ? avgNormal[0] : avgNormal[2];
        if (axisVal * candidate.normalSign < NORMAL_MATCH_THRESHOLD) continue;
        const candidateAxisIdx = candidate.axis === "x" ? 0 : 2;
        const candidateConst = (p0[candidateAxisIdx] + p1[candidateAxisIdx] + p2[candidateAxisIdx]) / 3;
        const center = candidate.axis === "x" ? centerX : centerZ;
        if ((candidateConst - center) * candidate.normalSign < 0) continue; // mặt trong, bỏ qua
        facade = candidate;
        break;
      }
      if (!facade) continue; // không phải tường ngoài thẳng đứng, hoặc là mặt trong của tường

      const constAxisIdx = facade.axis === "x" ? 0 : 2;
      const uAxisIdx = facade.axis === "x" ? 2 : 0;
      const avgConst = (p0[constAxisIdx] + p1[constAxisIdx] + p2[constAxisIdx]) / 3;

      const triUV: Pt[] = [
        [p0[uAxisIdx], p0[1]],
        [p1[uAxisIdx], p1[1]],
        [p2[uAxisIdx], p2[1]],
      ];

      for (const band of bands) {
        const clipped = clipPolygonToRect(triUV, -1e6, 1e6, band.y0, band.y1);
        if (clipped.length < 3) continue;
        pending.push({ facade, band, avgConst, points: clipped });
      }
    }
  }

  // Gộp theo (facade, tầng), rồi tách tiếp theo độ sâu trong mỗi nhóm.
  const groups = new Map<string, PendingFragment[]>();
  for (const frag of pending) {
    const key = `${frag.facade.id}-${frag.band.index}`;
    const arr = groups.get(key);
    if (arr) arr.push(frag);
    else groups.set(key, [frag]);
  }

  interface Bucket {
    facade: FacadeDirection;
    band: FloorBand;
    positions: number[];
    constSum: number;
    uSum: number;
    ySum: number;
    pointCount: number;
  }
  const buckets = new Map<string, Bucket>();

  interface ClusterAgg {
    indices: number[]; // chỉ số vào mảng frags
    area: number;
    avgConst: number; // trung bình có trọng số diện tích
  }

  const finalizeCluster = (indices: number[], frags: PendingFragment[], areas: number[]): ClusterAgg => {
    let area = 0;
    let constWeighted = 0;
    for (const i of indices) {
      area += areas[i];
      constWeighted += frags[i].avgConst * areas[i];
    }
    const avgConst = area > 1e-9 ? constWeighted / area : indices.reduce((s, i) => s + frags[i].avgConst, 0) / indices.length;
    return { indices, area, avgConst };
  };

  for (const frags of groups.values()) {
    const { facade, band } = frags[0];
    const constAxisIdx = facade.axis === "x" ? 0 : 2;
    const uAxisIdx = facade.axis === "x" ? 2 : 0;
    const areas = frags.map((f) => polygonArea(f.points));

    // 1) Phân cụm độ sâu ban đầu: sắp xếp theo avgConst rồi cắt cụm mới mỗi
    // khi khoảng hở giữa 2 giá trị liền kề vượt DEPTH_CLUSTER_GAP.
    const order = frags.map((_, i) => i).sort((a, b) => frags[a].avgConst - frags[b].avgConst);
    let clusters: ClusterAgg[] = [];
    let current: number[] = [order[0]];
    for (let k = 1; k < order.length; k++) {
      if (frags[order[k]].avgConst - frags[order[k - 1]].avgConst > DEPTH_CLUSTER_GAP) {
        clusters.push(finalizeCluster(current, frags, areas));
        current = [];
      }
      current.push(order[k]);
    }
    clusters.push(finalizeCluster(current, frags, areas));

    // 2) Gộp các cụm diện tích quá nhỏ (gờ, má cửa, bậc tam cấp...) vào cụm
    // liền kề gần nhất theo độ sâu, để chỉ các mặt tường THẬT (đủ lớn) mới
    // thành 1 mặt phẳng riêng.
    while (clusters.length > 1) {
      let smallestIdx = -1;
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].area < MIN_REGION_AREA && (smallestIdx === -1 || clusters[i].area < clusters[smallestIdx].area)) {
          smallestIdx = i;
        }
      }
      if (smallestIdx === -1) break;
      const prevGap = smallestIdx > 0 ? clusters[smallestIdx].avgConst - clusters[smallestIdx - 1].avgConst : Infinity;
      const nextGap = smallestIdx < clusters.length - 1 ? clusters[smallestIdx + 1].avgConst - clusters[smallestIdx].avgConst : Infinity;
      const neighborIdx = prevGap <= nextGap ? smallestIdx - 1 : smallestIdx + 1;
      const lo = Math.min(smallestIdx, neighborIdx);
      const merged = finalizeCluster([...clusters[smallestIdx].indices, ...clusters[neighborIdx].indices], frags, areas);
      clusters = [...clusters.slice(0, lo), merged, ...clusters.slice(lo + 2)];
    }

    // 3) Xếp hạng cụm nào "ra ngoài" nhất (theo hướng pháp tuyến) để đặt hậu
    // tố "-2", "-3"... cho các cụm lùi vào/lồi ra phía trong.
    const rankOrder = clusters
      .map((_, i) => i)
      .sort((a, b) => clusters[b].avgConst * facade.normalSign - clusters[a].avgConst * facade.normalSign);
    const rankOfCluster = new Array<number>(clusters.length);
    rankOrder.forEach((c, rank) => (rankOfCluster[c] = rank));

    clusters.forEach((cluster, c) => {
      const rank = rankOfCluster[c];
      const baseId = rank === 0 ? `${facade.id}${band.index}` : `${facade.id}${band.index}-${rank + 1}`;

      // 4) Chia mặt phẳng này thành số ít nhất hình chữ nhật (ưu tiên ngang).
      const polys = cluster.indices.map((i) => frags[i].points);
      const rects = decomposeIntoRectangles(polys, RECT_CELL_SIZE);
      const assigned = assignRectIds(baseId, rects);

      for (const { id, rect } of assigned) {
        let bucket = buckets.get(id);
        if (!bucket) {
          bucket = { facade, band, positions: [], constSum: 0, uSum: 0, ySum: 0, pointCount: 0 };
          buckets.set(id, bucket);
        }
        for (const fi of cluster.indices) {
          const frag = frags[fi];
          const clipped = clipPolygonToRect(frag.points, rect.uMin, rect.uMax, rect.yMin, rect.yMax);
          if (clipped.length < 3) continue;
          const toXYZ = (p: Pt): [number, number, number] => {
            const out: [number, number, number] = [0, 0, 0];
            out[constAxisIdx] = frag.avgConst;
            out[uAxisIdx] = p[0];
            out[1] = p[1];
            return out;
          };
          for (let k = 1; k < clipped.length - 1; k++) {
            bucket.positions.push(...toXYZ(clipped[0]), ...toXYZ(clipped[k]), ...toXYZ(clipped[k + 1]));
          }
          for (const p of clipped) {
            bucket.constSum += frag.avgConst;
            bucket.uSum += p[0];
            bucket.ySum += p[1];
            bucket.pointCount += 1;
          }
        }
      }
    });
  }

  const regions: WallRegion[] = [];
  for (const [id, bucket] of buckets) {
    if (bucket.positions.length === 0) continue;
    const constAxisIdx = bucket.facade.axis === "x" ? 0 : 2;
    const uAxisIdx = bucket.facade.axis === "x" ? 2 : 0;
    const center: [number, number, number] = [0, 0, 0];
    center[constAxisIdx] = bucket.constSum / bucket.pointCount;
    center[uAxisIdx] = bucket.uSum / bucket.pointCount;
    center[1] = bucket.ySum / bucket.pointCount;

    regions.push({
      id,
      facadeId: bucket.facade.id,
      facadeName: bucket.facade.name,
      bandIndex: bucket.band.index,
      bandLabel: bucket.band.label,
      axis: bucket.facade.axis,
      normalSign: bucket.facade.normalSign,
      center,
      rawPositions: new Float32Array(bucket.positions),
    });
  }

  regions.sort((a, b) => a.id.localeCompare(b.id));
  return regions;
}

/** Đẩy hình học của 1 vùng ra ngoài mặt tường 1 khoảng `offset`, dựng BufferGeometry sẵn sàng render (lớp phủ màu hoặc hotspot hover). UV = toạ độ thế giới (m) để material dạng texture lặp lại theo đúng tỉ lệ thật. */
export function buildRegionOverlayGeometry(region: WallRegion, offset: number): BufferGeometry {
  const constAxisIdx = region.axis === "x" ? 0 : 2;
  const uAxisIdx = region.axis === "x" ? 2 : 0;
  const positions = region.rawPositions.slice();
  for (let i = constAxisIdx; i < positions.length; i += 3) {
    positions[i] += region.normalSign * offset;
  }
  const normal: [number, number, number] = region.axis === "x" ? [region.normalSign, 0, 0] : [0, 0, region.normalSign];
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i++) {
    normals[i * 3] = normal[0];
    normals[i * 3 + 1] = normal[1];
    normals[i * 3 + 2] = normal[2];
    uvs[i * 2] = region.rawPositions[i * 3 + uAxisIdx];
    uvs[i * 2 + 1] = region.rawPositions[i * 3 + 1];
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  return geometry;
}

export function regionLabel(region: WallRegion): string {
  return `${region.id} — ${region.facadeName}, ${region.bandLabel}`;
}
