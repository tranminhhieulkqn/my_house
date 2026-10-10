#!/usr/bin/env python3
"""
Chỉnh sửa house.glb: bịt kín lỗ cửa sổ hiện có ở mặt B (tầng 1), và cắt 2 lỗ
cửa sổ mới vào mặt C (tầng 1), cùng kích thước/chiều cao với cửa sổ mặt B cũ.

Vị trí 2 cửa sổ mới ở mặt C (bản ĐÃ SỬA LẦN 2, theo phản hồi — bản đầu đặt
thẳng theo 2 cửa sổ mặt A bị lệch về 1 bên, không đối xứng):
- Giữ nguyên chiều cao: y in [4.893,6.471] (rộng 1.43m mỗi cửa, như cửa sổ
  mặt B cũ).
- 1 cửa sổ thẳng trục dọc (cùng tâm z) với cửa sổ thật đã có sẵn ở mặt C —
  tâm z=-3.965, ban đầu xác định qua vertex biên của 1 lỗ ở y>=7.2 (tưởng là
  sân thượng): biên trái z=-5.915, biên phải z=-2.015.
  XÁC NHẬN LẠI (sau phản hồi đợt 2): z=-3.965 thực ra KHỚP TUYỆT ĐỐI với cửa
  sổ thật ở chính TẦNG 1 — mặt phẳng tường lùi vào trong (`extractWallRegions()`
  gọi là vùng `C2-3`, khác mặt tường ngoài cùng `C2`), biên vertex THẬT đo
  được là z=[-4.68,-3.25], y=[4.893,6.471] — đúng bằng z=-3.965±0.715 đã
  dùng. "Sân thượng" trong lần đầu là nhầm tên tầng, nhưng toạ độ z vẫn đúng
  (giếng cầu thang xuyên tầng nên các lỗ cửa dọc theo nó thẳng trục nhau).
- Cửa sổ còn lại lấy ĐỐI XỨNG GƯƠNG qua tâm mặt C (z=-2.815305, từ
  wall z in [-6.115305,0.484695]) để đảm bảo lề trái = lề phải = 1.4353m —
  tâm z=-1.6656100189685823.
- rect1 (thẳng trục với cửa sổ thật ở vùng tường lùi `C2-3`, Tầng 1): z in [-4.68,-3.25]
  rect2 (đối xứng gương): z in [-2.380610018968582,-0.9506100189685823]

Dữ liệu gốc (xác nhận bằng cách dump WallRegion thật từ app đang chạy — tạm
expose `window.__wallRegionsDebug` trong WallRegionPainter.tsx, đọc qua
Playwright — đối chiếu với resources/photos/technical_drawings/mat_AB.png,
mat_BC.png):
- Cửa sổ mặt B hiện tại (tầng 1, TRƯỚC khi sửa): x in [2.264,3.694],
  y in [4.893,6.471] (rộng 1.43m, cao 1.578m) — 4 đỉnh biên đã có sẵn trong
  mesh, vertex index 148891 (BL), 148894 (BR), 148892 (TL), 148893 (TR).
  CHỈ đúng trên bản house.glb GỐC (chưa sửa) — xem SRC bên dưới.

Giữ lại script này CHỈ để tham khảo/ghi lại cách đã sửa — KHÔNG tự chạy lại
trên house.glb hiện tại (đã áp dụng thay đổi rồi): script phải chạy trên bản
GỐC (trước khi bịt lỗ mặt B lần đầu) vì giả định vị trí vertex 148891-148894
của lỗ cửa sổ mặt B CŨ. Nếu có bản SketchUp mới làm lại từ đầu (quy trình
chính thức — xem app/public/models/README.md), không cần dùng script này nữa.

Ghi ra file riêng (house_edited.glb), KHÔNG ghi đè trực tiếp house.glb, để
luôn xem lại bằng mắt (Playwright/trình duyệt) trước khi quyết định thay thế:
    python3 scripts/move_window_B_to_C_floor1.py
    # kiểm tra xong, nếu đúng: cp app/public/models/house_edited.glb app/public/models/house.glb
"""
import json
import struct
import array
import os

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(_REPO_ROOT, "app/public/models/house.glb")
DST = os.path.join(_REPO_ROOT, "app/public/models/house_edited.glb")

COMP = {5126: ("f", 4), 5125: ("I", 4), 5123: ("H", 2)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

B_RECT = (2.264, 3.694, 4.893, 6.471)  # u0,u1,y0,y1 (u=x for facade B)
# z0,z1,y0,y1 — rect1 thẳng trục cửa/cửa sổ mặt C tầng 2 (sân thượng),
# rect2 đối xứng gương qua tâm mặt C để lề trái = lề phải.
C_RECTS = [(-4.68, -3.25, 4.893, 6.471), (-2.380610018968582, -0.9506100189685823, 4.893, 6.471)]


def read_glb(path):
    data = open(path, "rb").read()
    offset = 12
    chunks = []
    while offset < len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunks.append((chunk_type, data[offset:offset + chunk_len]))
        offset += chunk_len
    gltf = json.loads(chunks[0][1])
    bin_data = chunks[1][1]
    return gltf, bin_data


gltf, bin_data = read_glb(SRC)
accessors = gltf["accessors"]
buffer_views = gltf["bufferViews"]
meshes = gltf["meshes"]


def read_accessor(acc_idx):
    acc = accessors[acc_idx]
    bv = buffer_views[acc["bufferView"]]
    start = bv.get("byteOffset", 0)
    count = acc["count"]
    nc = NCOMP[acc["type"]]
    typecode, itemsize = COMP[acc["componentType"]]
    raw = bin_data[start:start + count * nc * itemsize]
    arr = array.array(typecode)
    arr.frombytes(raw)
    return [tuple(arr[i * nc:(i + 1) * nc]) for i in range(count)], acc["componentType"], acc["type"]


# ---------------------------------------------------------------------------
# Load mesh[1] ("SKP Vertex Colors" — thân tường chính) full attribute data
# ---------------------------------------------------------------------------
MESH1_IDX = 1
mesh1 = meshes[MESH1_IDX]
prim1 = mesh1["primitives"][0]
pos_vals, pos_ct, pos_t = read_accessor(prim1["attributes"]["POSITION"])
norm_vals, norm_ct, norm_t = read_accessor(prim1["attributes"]["NORMAL"])
color_vals, color_ct, color_t = read_accessor(prim1["attributes"]["COLOR_0"])
idx_vals, idx_ct, idx_t = read_accessor(prim1["indices"])
idx_flat = [v[0] for v in idx_vals]
ntris = len(idx_flat) // 3

positions = list(pos_vals)  # mutable copies, will append new verts
normals = list(norm_vals)
colors = list(color_vals)

minX = min(p[0] for p in positions)
maxX = max(p[0] for p in positions)
centerX = (minX + maxX) / 2
THRESH = 0.75


def classify(i0, i1, i2):
    n0, n1, n2 = normals[i0], normals[i1], normals[i2]
    avgn = ((n0[0] + n1[0] + n2[0]) / 3, (n0[1] + n1[1] + n2[1]) / 3, (n0[2] + n1[2] + n2[2]) / 3)
    p0, p1, p2 = positions[i0], positions[i1], positions[i2]
    if avgn[2] >= THRESH:
        avgz = (p0[2] + p1[2] + p2[2]) / 3
        if avgz > 0:  # arbitrary; facade B centerZ handled by caller via explicit check below
            pass
    return avgn


# recompute center for facade classification (match extractWallRegions.ts logic)
minZ = min(p[2] for p in positions)
maxZ = max(p[2] for p in positions)
centerZ = (minZ + maxZ) / 2


def is_facade_b(i0, i1, i2):
    n0, n1, n2 = normals[i0], normals[i1], normals[i2]
    avgnz = (n0[2] + n1[2] + n2[2]) / 3
    if avgnz < THRESH:
        return False
    p0, p1, p2 = positions[i0], positions[i1], positions[i2]
    avgz = (p0[2] + p1[2] + p2[2]) / 3
    return (avgz - centerZ) >= 0


def is_facade_c(i0, i1, i2):
    n0, n1, n2 = normals[i0], normals[i1], normals[i2]
    avgnx = (n0[0] + n1[0] + n2[0]) / 3
    if avgnx > -THRESH:
        return False
    p0, p1, p2 = positions[i0], positions[i1], positions[i2]
    avgx = (p0[0] + p1[0] + p2[0]) / 3
    return (avgx - centerX) <= 0


# ---------------------------------------------------------------------------
# Step 1: build new triangle list, passthrough unless touched
# ---------------------------------------------------------------------------
new_tris = []
removed_c = 0
added_c = 0

# --- Part A: facade C — cut 2 window holes via proper clip (keep outside) ---

class V:
    __slots__ = ("pos", "norm", "color", "y", "z")
    def __init__(self, pos, norm, color):
        self.pos = pos
        self.norm = norm
        self.color = color
        self.y = pos[1]
        self.z = pos[2]


def lerp_v(a: V, b: V, t: float) -> V:
    pos = tuple(a.pos[k] + (b.pos[k] - a.pos[k]) * t for k in range(3))
    norm = tuple(a.norm[k] + (b.norm[k] - a.norm[k]) * t for k in range(3))
    col = tuple(a.color[k] + (b.color[k] - a.color[k]) * t for k in range(4))
    return V(pos, norm, col)


def clip_half(poly, coord_fn, keep_fn, value):
    """Sutherland-Hodgman clip of a convex polygon against 1 half-plane."""
    if not poly:
        return []
    out = []
    n = len(poly)
    for i in range(n):
        cur = poly[i]
        prev = poly[i - 1]
        cur_c = coord_fn(cur)
        prev_c = coord_fn(prev)
        cur_in = keep_fn(cur_c, value)
        prev_in = keep_fn(prev_c, value)
        if cur_in:
            if not prev_in:
                denom = (cur_c - prev_c)
                t = (value - prev_c) / denom if denom != 0 else 0.0
                out.append(lerp_v(prev, cur, t))
            out.append(cur)
        elif prev_in:
            denom = (cur_c - prev_c)
            t = (value - prev_c) / denom if denom != 0 else 0.0
            out.append(lerp_v(prev, cur, t))
    return out


def poly_area2(poly):
    s = 0.0
    n = len(poly)
    for i in range(n):
        a = poly[i]; b = poly[(i + 1) % n]
        s += a.y * b.z - b.y * a.z
    return abs(s)


def subtract_rect(poly, z0, z1, y0, y1):
    """Return list of convex polygons = poly MINUS rect[z0,z1]x[y0,y1]."""
    pieces = []
    rem = poly
    # outside via z < z0
    out1 = clip_half(rem, lambda v: v.z, lambda c, val: c < val, z0)
    if len(out1) >= 3 and poly_area2(out1) > 1e-9:
        pieces.append(out1)
    rem = clip_half(rem, lambda v: v.z, lambda c, val: c >= val, z0)
    if len(rem) < 3:
        return pieces
    out2 = clip_half(rem, lambda v: v.z, lambda c, val: c > val, z1)
    if len(out2) >= 3 and poly_area2(out2) > 1e-9:
        pieces.append(out2)
    rem = clip_half(rem, lambda v: v.z, lambda c, val: c <= val, z1)
    if len(rem) < 3:
        return pieces
    out3 = clip_half(rem, lambda v: v.y, lambda c, val: c < val, y0)
    if len(out3) >= 3 and poly_area2(out3) > 1e-9:
        pieces.append(out3)
    rem = clip_half(rem, lambda v: v.y, lambda c, val: c >= val, y0)
    if len(rem) < 3:
        return pieces
    out4 = clip_half(rem, lambda v: v.y, lambda c, val: c > val, y1)
    if len(out4) >= 3 and poly_area2(out4) > 1e-9:
        pieces.append(out4)
    # whatever remains now (y <= y1 and all previous) is INSIDE the rect: discard
    return pieces


def add_vertex(v: V) -> int:
    positions.append(v.pos)
    normals.append(v.norm)
    colors.append(v.color)
    return len(positions) - 1


def fan_triangulate_indices(index_list):
    tris = []
    for k in range(1, len(index_list) - 1):
        tris.append((index_list[0], index_list[k], index_list[k + 1]))
    return tris


for t in range(ntris):
    i0, i1, i2 = idx_flat[3 * t], idx_flat[3 * t + 1], idx_flat[3 * t + 2]

    if is_facade_c(i0, i1, i2):
        p0, p1, p2 = positions[i0], positions[i1], positions[i2]
        zs = [p0[2], p1[2], p2[2]]
        ys = [p0[1], p1[1], p2[1]]
        overlaps_any = False
        for (z0, z1, y0, y1) in C_RECTS:
            if not (max(zs) < z0 or min(zs) > z1 or max(ys) < y0 or min(ys) > y1):
                overlaps_any = True
                break
        if overlaps_any:
            removed_c += 1
            poly = [
                V(positions[i0], normals[i0], colors[i0]),
                V(positions[i1], normals[i1], colors[i1]),
                V(positions[i2], normals[i2], colors[i2]),
            ]
            pieces = [poly]
            for rect in C_RECTS:
                next_pieces = []
                for piece in pieces:
                    next_pieces.extend(subtract_rect(piece, *rect))
                pieces = next_pieces
            for piece in pieces:
                # dedupe near-identical consecutive points (can happen at corners)
                cleaned = []
                for v in piece:
                    if cleaned and abs(v.y - cleaned[-1].y) < 1e-7 and abs(v.z - cleaned[-1].z) < 1e-7:
                        continue
                    cleaned.append(v)
                if len(cleaned) >= 3 and abs(cleaned[0].y - cleaned[-1].y) < 1e-7 and abs(cleaned[0].z - cleaned[-1].z) < 1e-7:
                    cleaned.pop()
                if len(cleaned) < 3:
                    continue
                vidx = [add_vertex(v) for v in cleaned]
                for tri in fan_triangulate_indices(vidx):
                    new_tris.append(tri)
                    added_c += 1
            continue  # original triangle replaced

    new_tris.append((i0, i1, i2))

print(f"facade C: removed/clipped {removed_c} original triangles -> {added_c} new triangles")

# --- Part B: facade B — patch the old window hole closed with 2 triangles,
# reusing the 4 existing boundary vertices (no new vertices needed) ---
BL, TL, TR, BR = 148891, 148892, 148893, 148894
new_tris.append((BL, BR, TR))
new_tris.append((BL, TR, TL))
print("facade B: added 2 patch triangles closing the old window hole")

print(f"total triangles: {ntris} -> {len(new_tris)}")
print(f"total vertices: {len(pos_vals)} -> {len(positions)}")

# ---------------------------------------------------------------------------
# Step 2: rebuild the GLB — copy every mesh's attributes into a fresh buffer,
# only mesh[1] gets the new (extended) attribute arrays + new index list.
# ---------------------------------------------------------------------------
new_buffer = bytearray()
new_buffer_views = []
new_accessors = []
new_meshes = []


def push_buffer_view(raw_bytes, target=None):
    while len(new_buffer) % 4 != 0:
        new_buffer.append(0)
    byte_offset = len(new_buffer)
    new_buffer.extend(raw_bytes)
    bv = {"buffer": 0, "byteOffset": byte_offset, "byteLength": len(raw_bytes)}
    if target is not None:
        bv["target"] = target
    new_buffer_views.append(bv)
    return len(new_buffer_views) - 1


def pack_floats(values):
    flat = array.array("f")
    for t in values:
        flat.extend(t)
    return flat.tobytes()


def add_accessor(values, comp_type, acc_type, target):
    bv_idx = push_buffer_view(pack_floats(values), target=target)
    nc = NCOMP[acc_type]
    mins = [min(v[c] for v in values) for c in range(nc)] if values else [0] * nc
    maxs = [max(v[c] for v in values) for c in range(nc)] if values else [0] * nc
    new_accessors.append({
        "bufferView": bv_idx, "componentType": comp_type, "count": len(values),
        "type": acc_type, "min": mins, "max": maxs,
    })
    return len(new_accessors) - 1


for mi, mesh in enumerate(meshes):
    prim = mesh["primitives"][0]
    mat_idx = prim.get("material")
    mode = prim.get("mode", 4)

    if mi == MESH1_IDX:
        pos_acc = add_accessor(positions, 5126, "VEC3", 34962)
        norm_acc = add_accessor(normals, 5126, "VEC3", 34962)
        color_acc = add_accessor(colors, 5126, "VEC4", 34962)
        flat_idx = [v for tri in new_tris for v in tri]
        idx_bv = push_buffer_view(array.array("I", flat_idx).tobytes(), target=34963)
        new_accessors.append({
            "bufferView": idx_bv, "componentType": 5125, "count": len(flat_idx),
            "type": "SCALAR", "min": [0], "max": [max(flat_idx)],
        })
        idx_acc = len(new_accessors) - 1
        new_mesh = {"primitives": [{"mode": mode, "attributes": {
            "POSITION": pos_acc, "NORMAL": norm_acc, "COLOR_0": color_acc,
        }, "indices": idx_acc}]}
        if mat_idx is not None:
            new_mesh["primitives"][0]["material"] = mat_idx
        new_meshes.append(new_mesh)
        continue

    # passthrough: copy this mesh's attributes/indices verbatim into new buffer
    attrs = prim["attributes"]
    new_prim_attrs = {}
    for name, acc_idx in attrs.items():
        vals, comp_type, acc_type = read_accessor(acc_idx)
        new_prim_attrs[name] = add_accessor(vals, comp_type, acc_type, 34962)
    idx_v, idx_comp, idx_type = read_accessor(prim["indices"])
    flat = [v[0] for v in idx_v]
    idx_bv = push_buffer_view(array.array("I", flat).tobytes(), target=34963)
    new_accessors.append({
        "bufferView": idx_bv, "componentType": 5125, "count": len(flat),
        "type": "SCALAR", "min": [0], "max": [max(flat) if flat else 0],
    })
    idx_acc = len(new_accessors) - 1
    new_mesh = {"primitives": [{"mode": mode, "attributes": new_prim_attrs, "indices": idx_acc}]}
    if mat_idx is not None:
        new_mesh["primitives"][0]["material"] = mat_idx
    new_meshes.append(new_mesh)

new_gltf = dict(gltf)
new_gltf["meshes"] = new_meshes
new_gltf["accessors"] = new_accessors
new_gltf["bufferViews"] = new_buffer_views
while len(new_buffer) % 4 != 0:
    new_buffer.append(0)
new_gltf["buffers"] = [{"byteLength": len(new_buffer)}]

json_bytes = json.dumps(new_gltf).encode("utf-8")
while len(json_bytes) % 4 != 0:
    json_bytes += b" "
bin_bytes = bytes(new_buffer)
total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

with open(DST, "wb") as f:
    f.write(struct.pack("<4sII", b"glTF", 2, total_len))
    f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    f.write(json_bytes)
    f.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
    f.write(bin_bytes)

print("wrote", DST, total_len, "bytes")
