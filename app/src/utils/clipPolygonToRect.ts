type Pt = [number, number];

function clipEdge(poly: Pt[], inside: (p: Pt) => boolean, intersect: (a: Pt, b: Pt) => Pt): Pt[] {
  if (poly.length === 0) return poly;
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const currIn = inside(curr);
    const nextIn = inside(next);
    if (currIn) out.push(curr);
    if (currIn !== nextIn) out.push(intersect(curr, next));
  }
  return out;
}

function lerpAt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Cắt 1 đa giác lồi 2D (Sutherland-Hodgman — nhận cả tam giác lẫn đa giác đã
 * cắt trước đó) theo hình chữ nhật trục-thẳng [uMin,uMax] x [vMin,vMax]. Trả
 * về đa giác lồi kết quả (rỗng nếu không giao nhau), giữ nguyên thứ tự đỉnh
 * để fan-triangulate sau đó.
 */
export function clipPolygonToRect(poly: Pt[], uMin: number, uMax: number, vMin: number, vMax: number): Pt[] {
  poly = clipEdge(
    poly,
    (p) => p[0] >= uMin,
    (a, b) => lerpAt(a, b, (uMin - a[0]) / (b[0] - a[0])),
  );
  poly = clipEdge(
    poly,
    (p) => p[0] <= uMax,
    (a, b) => lerpAt(a, b, (uMax - a[0]) / (b[0] - a[0])),
  );
  poly = clipEdge(
    poly,
    (p) => p[1] >= vMin,
    (a, b) => lerpAt(a, b, (vMin - a[1]) / (b[1] - a[1])),
  );
  poly = clipEdge(
    poly,
    (p) => p[1] <= vMax,
    (a, b) => lerpAt(a, b, (vMax - a[1]) / (b[1] - a[1])),
  );
  return poly;
}
