import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import type { Mesh, MeshStandardMaterial, Object3D } from "three";
import { Box3 } from "three";
import { useHouseStore } from "../../store/useHouseStore";
import type { MaterialSlotId } from "../../types/house";

// Vật liệu gạch ốp của khối phòng trên sân thượng ("Tường gạch" trong panel
// Màu sắc) — mesh riêng, KHÔNG dùng vertex color như thân nhà chính, nên cần
// gộp thêm vào danh sách mesh nguồn khi dò vùng tường chọn/tuỳ biến được.
const BRICK_MATERIAL_NAME = "[Brick Antique 01]";

export const MODEL_URL = `${import.meta.env.BASE_URL}models/house.glb`;

/** Vật liệu thuộc về ngữ cảnh (đường, sân...), không tính vào kích thước nhà. */
export const CONTEXT_MATERIALS = new Set(["[Carpet Plush Charcoal]"]);

/** Bounding box của riêng khối nhà, bỏ qua các mesh dùng vật liệu ngữ cảnh. */
export function computeBuildingBox(root: Object3D): Box3 {
  const box = new Box3();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as MeshStandardMaterial | MeshStandardMaterial[];
    const name = Array.isArray(material) ? material[0]?.name : material?.name;
    if (name && CONTEXT_MATERIALS.has(name)) return;
    box.expandByObject(mesh);
  });
  return box;
}

/**
 * Ánh xạ tên vật liệu THẬT trong house.glb (xuất từ
 * resources/3d/sketchup/house_source.skp) sang các slot tùy biến màu sắc.
 * Các vật liệu còn lại trong model (site/context, vertex-color...) giữ
 * nguyên như bản gốc, không cho tùy biến vì không rõ chúng phủ lên những
 * phần nào của nhà.
 */
const MATERIAL_MAP: Record<string, MaterialSlotId> = {
  [BRICK_MATERIAL_NAME]: "wall",
  "[Translucent Glass Gold]": "window",
  "432": "wood",
  "Color M05": "concrete",
};

/**
 * Các mesh làm nguồn cho hệ thống vùng tường chọn/tuỳ biến được (hex màu
 * hoặc ốp gạch) — mesh thân nhà chính (vertex color) VÀ mesh gạch ốp phòng
 * sân thượng (material riêng, không phải vertex color).
 */
export function findWallRegionMeshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry.getAttribute("color")) {
      found.push(mesh);
      return;
    }
    const material = mesh.material as MeshStandardMaterial | MeshStandardMaterial[];
    const name = Array.isArray(material) ? material[0]?.name : material?.name;
    if (name === BRICK_MATERIAL_NAME) found.push(mesh);
  });
  return found;
}

/** Mô hình nhà thật, load từ file GLB (xem public/models/README.md). */
export function HouseModel() {
  const { scene, materials } = useGLTF(MODEL_URL);
  const colors = useHouseStore((s) => s.materialColors);
  const shadowsEnabled = useHouseStore((s) => s.shadowsEnabled);

  useEffect(() => {
    for (const [materialName, slot] of Object.entries(MATERIAL_MAP)) {
      const material = materials[materialName] as MeshStandardMaterial | undefined;
      if (material) material.color.set(colors[slot]);
    }
  }, [materials, colors]);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = shadowsEnabled;
      mesh.receiveShadow = shadowsEnabled;
    });
  }, [scene, shadowsEnabled]);

  return <primitive object={scene} />;
}

useGLTF.preload(MODEL_URL);
