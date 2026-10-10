import { useMemo } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { computeBuildingBox, findWallRegionMeshes, MODEL_URL } from "./HouseModel";
import { useHouseStore } from "../../store/useHouseStore";
import { buildFloorBands } from "../../data/wallRegions";
import { extractWallRegions } from "../../utils/extractWallRegions";

const HAZE_COLOR = "#ffffff";
const HAZE_OPACITY = 0.8;
// Nhà dân xây sát vách thường thấp hơn tầng trệt của nhà chính 1 chút.
const HEIGHT_RATIO = 1.0;

// Tên hiển thị cho 2 nhà hàng xóm sát vách — đổi thành tên thật tuỳ ý nếu
// chạy riêng cho mình, tránh commit tên thật lên repo public.
const C_SIDE_NAME = "Nhà hàng xóm (mặt C)";
const D_SIDE_NAME = "Nhà hàng xóm (mặt D)";

const noRaycast = () => null;

function NeighborLabel({ position, name }: { position: [number, number, number]; name: string }) {
  return (
    <Html position={position} center distanceFactor={10} style={{ pointerEvents: "none" }}>
      <div
        style={{
          background: "rgba(31,36,48,0.85)",
          color: "#fff",
          padding: "3px 9px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {name}
      </div>
    </Html>
  );
}

/** Thẻ tròn A/B/C/D nhỏ, cùng kiểu với `FacadeBadge` của nhà chính (FacadeLabels.tsx). */
function NeighborFacadeBadge({ position, id }: { position: [number, number, number]; id: string }) {
  return (
    <Html position={position} center distanceFactor={10} style={{ pointerEvents: "none" }}>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#1f2430",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        }}
      >
        {id}
      </div>
    </Html>
  );
}

/**
 * 4 thẻ A/B/C/D cho 1 khối nhà hàng xóm hình hộp, CÙNG quy ước hướng với nhà
 * chính (A = pháp tuyến ra ngoài hướng +X, B = +Z, C = -X, D = -Z) — không
 * phải hướng cục bộ riêng của từng khối, để gọi tên nhất quán giữa các nhà.
 */
function boxFacadeBadges(xMin: number, xMax: number, zMin: number, zMax: number, y: number) {
  const midX = (xMin + xMax) / 2;
  const midZ = (zMin + zMax) / 2;
  return [
    { id: "A", position: [xMax, y, midZ] as [number, number, number] },
    { id: "B", position: [midX, y, zMax] as [number, number, number] },
    { id: "C", position: [xMin, y, midZ] as [number, number, number] },
    { id: "D", position: [midX, y, zMin] as [number, number, number] },
  ];
}

/**
 * Mặt C (sau) và D (phải) giáp nhà dân xây sát vách, che khuất tường tầng
 * trệt ngoài thực tế — biểu diễn đơn giản bằng 1 khối hộp mờ trắng (bóng mờ,
 * không tô màu thật của nhà hàng xóm vì không có dữ liệu), có option ẩn/hiện
 * riêng (mục Hiển thị). Khối ở mặt C: cạnh phía D thẳng hàng với tường mặt D,
 * còn cạnh phía B (mặt B của chính khối này, xem `boxFacadeBadges`) lấy đúng
 * mặt phẳng các vùng "B1-2*". Khối ở mặt D: cạnh phía C thẳng hàng với tường
 * mặt C, còn cạnh phía A (mặt A của chính khối này) lấy đúng mặt phẳng các
 * vùng "A1-2*". "A1-2*"/"B1-2*" (mặt chính tầng trệt, đã lùi vào so với phần
 * tường/bậc tam cấp nhô ra phía trước — `extractWallRegions`) được dùng thay
 * vì mép ngoài cùng của bounding box: phần nhô ra đó (vd mái hiên/bậc tam
 * cấp) có thể đua ra ngoài khoảng lùi thật của lô đất, nhưng tường XÂY của
 * nhà hàng xóm thì không được phép đè lên mặt đường nên phải thụt vào đúng
 * theo tường chính A1-2/B1-2. Độ sâu (hướng ra ngoài, vuông góc mặt tường)
 * của cả 2 khối lấy đúng bằng chiều sâu thật của nhà chính (cùng số liệu với
 * "Sâu" trong Dimensions.tsx). Đáy khối đặt đúng bằng mặt phẳng đáy thật của
 * nhà chính (`box.min.y` — nền móng, thấp hơn cao độ ±0.000 dùng để ghi chú
 * chiều cao tầng) thay vì nổi lên trên; mặt phẳng này trùng đúng cao độ mặt
 * đường trong model nên khối không chìm xuống dưới/đè lên mặt đường. Không
 * nhận sự kiện chuột (`raycast={noRaycast}`) để không chặn chọn/tuỳ biến
 * vùng tường thật của chính ngôi nhà khi đang hiện. Mỗi khối còn có 4 thẻ
 * A/B/C/D riêng (cùng quy ước hướng với nhà chính) để gọi tên từng mặt của
 * nó khi trao đổi.
 */
export function NeighboringHouses() {
  const { scene } = useGLTF(MODEL_URL);
  const show = useHouseStore((s) => s.showNeighboringHouses);
  const box = useMemo(() => computeBuildingBox(scene), [scene]);
  const wallMeshes = useMemo(() => findWallRegionMeshes(scene), [scene]);
  const regions = useMemo(
    () => (wallMeshes.length ? extractWallRegions(wallMeshes, box.max.y) : []),
    [wallMeshes, box],
  );

  if (!show) return null;

  const { min, max } = box;
  const groundFloorY1 = buildFloorBands(max.y)[0].y1;
  const height = groundFloorY1 * HEIGHT_RATIO;
  const baseY = min.y; // đáy thật của nhà chính (= cao độ mặt đường trong model)
  const centerY = baseY + height / 2;
  const spanX = max.x - min.x; // chiều sâu nhà chính ("Sâu" trong Dimensions.tsx)
  const depth = spanX; // độ sâu khối nhà hàng xóm = độ sâu nhà chính, dùng cho cả 2 mặt

  // Mặt A của khối nhà hàng xóm (mặt D) thụt vào đúng theo mặt phẳng các vùng A1-2* (mặt
  // chính, không tính phần nhô ra nhỏ phía ngoài) — để không đè lên mặt đường.
  const a12Regions = regions.filter((r) => r.facadeId === "A" && r.bandIndex === 1 && r.id.startsWith("A1-2"));
  const aEdgeX = a12Regions.length
    ? a12Regions.reduce((sum, r) => sum + r.center[0], 0) / a12Regions.length
    : max.x;
  const dSpanX = aEdgeX - min.x / 2;
  // Cạnh mặt A thật của khối (theo đúng dSpanX ở trên) — dùng để đặt thẻ A/D
  // cho khớp hình học khối, KHÔNG dùng trực tiếp aEdgeX (lệch nhau theo công thức này).
  const dEdgeX = min.x + dSpanX;

  // Tương tự, mặt B của khối nhà hàng xóm (mặt C) thụt vào đúng theo mặt phẳng B1-2*.
  const b12Regions = regions.filter((r) => r.facadeId === "B" && r.bandIndex === 1 && r.id.startsWith("B1-2"));
  const bEdgeZ = b12Regions.length
    ? b12Regions.reduce((sum, r) => sum + r.center[2], 0) / b12Regions.length
    : max.z;
  const cSpanZ = bEdgeZ - min.z;

  const cBoxCenter: [number, number, number] = [min.x - depth / 2, centerY, min.z + cSpanZ / 2];
  const dBoxCenter: [number, number, number] = [min.x + dSpanX / 2, centerY, min.z - depth / 2];

  const cBadges = boxFacadeBadges(min.x - depth, min.x, min.z, bEdgeZ, centerY);
  const dBadges = boxFacadeBadges(min.x, dEdgeX, min.z - depth, min.z, centerY);

  return (
    <group>
      {/* Mặt C — mặt sau (min.x): cạnh phía D thẳng hàng với mặt D, cạnh phía B thẳng hàng với mặt phẳng B1-2 */}
      <mesh position={cBoxCenter} raycast={noRaycast}>
        <boxGeometry args={[depth, height, cSpanZ]} />
        <meshBasicMaterial color={HAZE_COLOR} transparent opacity={HAZE_OPACITY} depthWrite={false} />
      </mesh>
      <NeighborLabel position={[cBoxCenter[0], centerY + height / 2 + 0.3, cBoxCenter[2]]} name={C_SIDE_NAME} />
      {cBadges.map((b) => (
        <NeighborFacadeBadge key={`c-${b.id}`} position={b.position} id={b.id} />
      ))}

      {/* Mặt D — mặt bên phải (min.z): cạnh phía C thẳng hàng với mặt C, cạnh phía A thẳng hàng với mặt phẳng A1-2 */}
      <mesh position={dBoxCenter} raycast={noRaycast}>
        <boxGeometry args={[dSpanX, height, depth]} />
        <meshBasicMaterial color={HAZE_COLOR} transparent opacity={HAZE_OPACITY} depthWrite={false} />
      </mesh>
      <NeighborLabel position={[dBoxCenter[0], centerY + height / 2 + 0.3, dBoxCenter[2]]} name={D_SIDE_NAME} />
      {dBadges.map((b) => (
        <NeighborFacadeBadge key={`d-${b.id}`} position={b.position} id={b.id} />
      ))}
    </group>
  );
}
