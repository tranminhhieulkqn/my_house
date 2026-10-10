#!/usr/bin/env python3
"""
Cắt bỏ 1 cụm hình học theo ranh giới trục X trong file GLB, giữ lại cụm còn
lại. Dùng khi 1 file glTF/GLB gộp nhiều khối rời rạc (vd 2 căn nhà) vào
chung mesh theo vật liệu (không tách theo node/object), nên không thể xoá
bằng cách bỏ node — phải cắt ở mức tam giác.

Cách dùng:
    python3 scripts/split_glb_by_x.py <input.glb> <output.glb> <threshold> [--keep above|below]

Ví dụ (trường hợp đã dùng cho app/public/models/house.glb — 2 cụm nhà cách
nhau bởi khoảng trống x=[8,26], ngưỡng 18, giữ cụm có x nhỏ hơn — cụm có
mặt đường phía trước):
    python3 scripts/split_glb_by_x.py house_full.glb house.glb 18 --keep below

Chỉ hoạt động đúng khi các cụm hình học KHÔNG chồng lấn theo trục X (kiểm
tra trước bằng cách in histogram tọa độ X của từng mesh — xem
docs/DU-LIEU-BAN-VE.md để biết cách làm).
"""
import argparse
import array
import json
import struct


COMP = {5126: ("f", 4), 5125: ("I", 4), 5123: ("H", 2)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("threshold", type=float)
    ap.add_argument("--keep", choices=["below", "above"], default="below",
                     help="giữ tam giác có x trung bình < threshold (below) hay >= threshold (above)")
    args = ap.parse_args()

    gltf, bin_data = read_glb(args.input)
    accessors = gltf["accessors"]
    buffer_views = gltf["bufferViews"]
    meshes = gltf["meshes"]

    def read_accessor(acc_idx):
        acc = accessors[acc_idx]
        bv = buffer_views[acc["bufferView"]]
        start = bv["byteOffset"]
        count = acc["count"]
        nc = NCOMP[acc["type"]]
        typecode, itemsize = COMP[acc["componentType"]]
        raw = bin_data[start:start + count * nc * itemsize]
        arr = array.array(typecode)
        arr.frombytes(raw)
        return [tuple(arr[i * nc:(i + 1) * nc]) for i in range(count)], acc["componentType"], acc["type"]

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

    total_kept = total_dropped = 0

    for mi, mesh in enumerate(meshes):
        prim = mesh["primitives"][0]
        attrs = prim["attributes"]
        mat_idx = prim.get("material")
        mode = prim.get("mode", 4)

        idx_vals, _, _ = read_accessor(prim["indices"])
        idx_flat = [v[0] for v in idx_vals]

        attr_data, attr_meta = {}, {}
        for name, acc_idx in attrs.items():
            vals, comp_type, acc_type = read_accessor(acc_idx)
            attr_data[name] = vals
            attr_meta[name] = (comp_type, acc_type)

        pos_data = attr_data["POSITION"]
        total_tris = len(idx_flat) // 3
        kept = []
        for t in range(total_tris):
            i0, i1, i2 = idx_flat[3 * t], idx_flat[3 * t + 1], idx_flat[3 * t + 2]
            xavg = (pos_data[i0][0] + pos_data[i1][0] + pos_data[i2][0]) / 3
            if (xavg < args.threshold) == (args.keep == "below"):
                kept.append((i0, i1, i2))

        total_kept += len(kept)
        total_dropped += total_tris - len(kept)

        used = sorted({v for tri in kept for v in tri})
        old_to_new = {old: new for new, old in enumerate(used)}
        new_indices = [old_to_new[v] for tri in kept for v in tri]

        new_prim_attrs = {}
        for name, vals in attr_data.items():
            new_vals = [vals[old] for old in used]
            comp_type, acc_type = attr_meta[name]
            bv_idx = push_buffer_view(pack_floats(new_vals), target=34962)
            nc = NCOMP[acc_type]
            mins = [min(v[c] for v in new_vals) for c in range(nc)] if new_vals else [0] * nc
            maxs = [max(v[c] for v in new_vals) for c in range(nc)] if new_vals else [0] * nc
            new_accessors.append({
                "bufferView": bv_idx, "componentType": comp_type, "count": len(new_vals),
                "type": acc_type, "min": mins, "max": maxs,
            })
            new_prim_attrs[name] = len(new_accessors) - 1

        idx_bv = push_buffer_view(array.array("I", new_indices).tobytes(), target=34963)
        new_accessors.append({
            "bufferView": idx_bv, "componentType": 5125, "count": len(new_indices),
            "type": "SCALAR", "min": [0], "max": [max(new_indices) if new_indices else 0],
        })
        idx_acc_pos = len(new_accessors) - 1

        new_mesh = {"primitives": [{"mode": mode, "attributes": new_prim_attrs, "indices": idx_acc_pos}]}
        if mat_idx is not None:
            new_mesh["primitives"][0]["material"] = mat_idx
        new_meshes.append(new_mesh)
        print(f"mesh {mi}: kept {len(kept)}/{total_tris} tris, {len(used)} verts")

    print("TOTAL kept tris:", total_kept, "dropped:", total_dropped)

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

    with open(args.output, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
        f.write(bin_bytes)

    print("wrote", args.output, total_len, "bytes")


if __name__ == "__main__":
    main()
