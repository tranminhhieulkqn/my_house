import { useMemo, useState } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { DoubleSide } from "three";
import { computeBuildingBox, findWallRegionMeshes, MODEL_URL } from "./HouseModel";
import { useHouseStore } from "../../store/useHouseStore";
import { buildFacades, type Facade } from "../../data/wallRegions";
import { extractWallRegions, buildRegionOverlayGeometry, regionLabel, type WallRegion } from "../../utils/extractWallRegions";

const HOTSPOT_OFFSET = 0.05; // đẩy hotspot ra ngoài mặt tường 1 chút để tránh z-fighting

/**
 * Hotspot hover/chọn 1 vùng tường. Hình học bằng đúng phần tường THẬT thuộc
 * vùng (từ `extractWallRegions`, gộp theo hướng mặt ngoài + tầng) — không
 * dùng 1 mặt phẳng hình chữ nhật phủ cả vùng, nên rê chuột vào lỗ cửa
 * sổ/cửa đi hoặc phần tường của vùng khác sẽ không bị tính nhầm.
 */
function FacadeHotspot({ region }: { region: WallRegion }) {
  const [hovered, setHovered] = useState(false);
  const selected = useHouseStore((s) => s.selectedWallRegion === region.id);
  const setSelectedWallRegion = useHouseStore((s) => s.setSelectedWallRegion);

  const geometry = useMemo(() => buildRegionOverlayGeometry(region, HOTSPOT_OFFSET), [region]);

  const labelPosition: [number, number, number] = [
    region.center[0] + (region.axis === "x" ? region.normalSign * 0.1 : 0),
    region.center[1],
    region.center[2] + (region.axis === "z" ? region.normalSign * 0.1 : 0),
  ];

  // Khi đã chọn, chỉ highlight mờ nhẹ để không che màu tuỳ biến thật đang áp
  // dụng (lớp phủ màu của WallRegionPainter nằm ngay bên dưới/trên vị trí này).
  const opacity = selected ? 0.18 : hovered ? 0.38 : 0.001;
  const color = selected ? "#2f6fde" : "#ffb703";

  return (
    <group>
      <mesh
        geometry={geometry}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedWallRegion(selected ? null : region.id);
        }}
      >
        <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
      </mesh>
      {(hovered || selected) && (
        <Html position={labelPosition} center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div
            style={{
              background: "rgba(31,36,48,0.92)",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {regionLabel(region)}
            {selected ? " (đã chọn)" : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Thẻ chữ A/B/C/D cố định, đặt giữa mỗi mặt nhà (luôn hiển thị để định hướng). */
function FacadeBadge({ facade, maxY }: { facade: Facade; maxY: number }) {
  const mid = (facade.spanFrom + facade.spanTo) / 2;
  const midY = maxY / 2;
  const offsetConstant = facade.constant + facade.normalSign * 0.6;
  const position: [number, number, number] =
    facade.axis === "z" ? [mid, midY, offsetConstant] : [offsetConstant, midY, mid];

  return (
    <Html position={position} center distanceFactor={10} style={{ pointerEvents: "none" }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "#1f2430",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        }}
      >
        {facade.id}
      </div>
    </Html>
  );
}

/**
 * Đánh dấu 4 mặt nhà A/B/C/D (A = mặt trước, có cửa chính) và chia mỗi mặt
 * thành các vùng theo tầng (A1/A2/A3...), tách riêng khi gấp khúc (vd tường
 * trong ban công), rồi chia tiếp mỗi mặt phẳng thành số ít nhất hình chữ
 * nhật quanh cửa sổ/cửa đi/bậc tam cấp... (A2a, A2b...) — toàn bộ tường
 * ngoài, mọi tầng, đều chọn/tuỳ biến được, không còn vùng nào bị khoá cứng.
 * Rê chuột để xem tên phần, bấm để chọn vùng rồi chỉnh màu hex hoặc ốp gạch
 * men trong panel bên phải.
 */
export function FacadeLabels() {
  const { scene } = useGLTF(MODEL_URL);
  const show = useHouseStore((s) => s.showFacadeLabels);
  const box = useMemo(() => computeBuildingBox(scene), [scene]);

  const wallMeshes = useMemo(() => findWallRegionMeshes(scene), [scene]);
  const regions = useMemo(
    () => (wallMeshes.length ? extractWallRegions(wallMeshes, box.max.y) : []),
    [wallMeshes, box],
  );

  if (!show || !wallMeshes.length) return null;

  const facades = buildFacades(box.min, box.max);

  return (
    <group>
      {facades.map((facade) => (
        <FacadeBadge key={facade.id} facade={facade} maxY={box.max.y} />
      ))}
      {regions.map((region) => (
        <FacadeHotspot key={region.id} region={region} />
      ))}
    </group>
  );
}
