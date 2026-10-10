import { useEffect, useMemo } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import { DoubleSide, RepeatWrapping, type Texture } from "three";
import { computeBuildingBox, findWallRegionMeshes, MODEL_URL } from "./HouseModel";
import { extractWallRegions, buildRegionOverlayGeometry, type WallRegion } from "../../utils/extractWallRegions";
import { useHouseStore } from "../../store/useHouseStore";

const OVERLAY_OFFSET = 0.03; // đẩy lớp phủ ra ngoài mặt tường 1 chút, tránh z-fighting

// Mẫu gạch men 60x60cm (resources/photos/metirials/image.png) — tuỳ chọn ốp
// cho BẤT KỲ vùng tường nào người dùng chọn (xem WallRegionEditor), không
// còn gắn cố định vào 1 mặt/tầng cụ thể.
const TILE_SIZE_M = 0.6;
const TILE_TEXTURE_URL = `${import.meta.env.BASE_URL}textures/floor1-tile-60cm.png`;
useTexture.preload(TILE_TEXTURE_URL);

function RegionOverlay({ region, color }: { region: WallRegion; color: string }) {
  const geometry = useMemo(() => buildRegionOverlayGeometry(region, OVERLAY_OFFSET), [region]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.85} side={DoubleSide} />
    </mesh>
  );
}

function TileOverlay({ region, texture }: { region: WallRegion; texture: Texture }) {
  const geometry = useMemo(() => buildRegionOverlayGeometry(region, OVERLAY_OFFSET), [region]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={0.5} side={DoubleSide} />
    </mesh>
  );
}

/**
 * Lớp phủ tuỳ biến riêng từng vùng tường (A1, A2a, A2b, ...) — áp cho các
 * mesh không đổi màu qua materialColors được theo cả mảng (thân nhà chính
 * dùng vertex color, VÀ mesh gạch ốp phòng sân thượng dùng 1 material
 * riêng). Vùng lấy từ `extractWallRegions` — gộp theo hướng mặt ngoài thật +
 * tầng, tách riêng khi gấp khúc (vd tường trong ban công), rồi chia tiếp mỗi
 * mặt phẳng thành số ít nhất hình chữ nhật quanh cửa sổ/cửa đi/bậc tam
 * cấp... Mỗi vùng có thể chọn tô màu hex HOẶC ốp gạch men 60x60cm (xem
 * WallRegionEditor).
 */
export function WallRegionPainter() {
  const { scene } = useGLTF(MODEL_URL);
  const wallRegionFinishes = useHouseStore((s) => s.wallRegionFinishes);
  const tileTexture = useTexture(TILE_TEXTURE_URL);

  useEffect(() => {
    tileTexture.wrapS = RepeatWrapping;
    tileTexture.wrapT = RepeatWrapping;
    tileTexture.repeat.set(1 / TILE_SIZE_M, 1 / TILE_SIZE_M);
    tileTexture.needsUpdate = true;
  }, [tileTexture]);

  const box = useMemo(() => computeBuildingBox(scene), [scene]);
  const wallMeshes = useMemo(() => findWallRegionMeshes(scene), [scene]);
  const regions = useMemo(
    () => (wallMeshes.length ? extractWallRegions(wallMeshes, box.max.y) : []),
    [wallMeshes, box],
  );

  if (!wallMeshes.length) return null;

  return (
    <>
      {Object.entries(wallRegionFinishes).map(([regionId, finish]) => {
        const region = regions.find((r) => r.id === regionId);
        if (!region) return null;
        if (finish.kind === "tile") return <TileOverlay key={regionId} region={region} texture={tileTexture} />;
        return <RegionOverlay key={regionId} region={region} color={finish.hex} />;
      })}
    </>
  );
}
