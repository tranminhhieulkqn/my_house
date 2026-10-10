import { useMemo } from "react";
import { Html, Line, useGLTF } from "@react-three/drei";
import { computeBuildingBox, MODEL_URL } from "./HouseModel";
import { useHouseStore } from "../../store/useHouseStore";

type P3 = [number, number, number];

const fmt = (m: number) => `${m.toFixed(2)} m`;

function DimensionLine({
  from,
  to,
  offsetDir,
  offsetAmount,
  label,
}: {
  from: P3;
  to: P3;
  offsetDir: P3;
  offsetAmount: number;
  label: string;
}) {
  const p1: P3 = [from[0] + offsetDir[0] * offsetAmount, from[1] + offsetDir[1] * offsetAmount, from[2] + offsetDir[2] * offsetAmount];
  const p2: P3 = [to[0] + offsetDir[0] * offsetAmount, to[1] + offsetDir[1] * offsetAmount, to[2] + offsetDir[2] * offsetAmount];
  const mid: P3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
  const color = "#1f2430";

  return (
    <group>
      <Line points={[from, p1]} color={color} lineWidth={1} />
      <Line points={[to, p2]} color={color} lineWidth={1} />
      <Line points={[p1, p2]} color={color} lineWidth={1.5} />
      <Html position={mid} center distanceFactor={10} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(0,0,0,0.25)",
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: 12,
            color: "#1f2430",
            whiteSpace: "nowrap",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

/**
 * Cao độ từng tầng — lấy theo số liệu đã xác nhận từ bản vẽ kết cấu
 * (chi tiết cột: 0 / 3.8 / 7.2) và mặt đứng kiến trúc (tổng cao 10.6,
 * khớp đúng với Y lớn nhất trong house.glb). Không tự suy ra từ hình học
 * vì khối lượng vertex quá lớn/nhiễu (nội thất, chi tiết nhỏ) để tách
 * đáng tin cậy từng mặt sàn.
 */
const FLOOR_LEVELS: { z: number; label: string }[] = [
  { z: 0, label: "Tầng trệt" },
  { z: 3.8, label: "Tầng 1" },
  { z: 7.2, label: "Sân thượng / mái" },
];

/** Hiển thị kích thước tổng thể + chiều cao từng tầng, dạng đường gióng kiến trúc. */
export function Dimensions() {
  const { scene } = useGLTF(MODEL_URL);
  const show = useHouseStore((s) => s.showDimensions);

  const box = useMemo(() => computeBuildingBox(scene), [scene]);

  if (!show) return null;

  const { min, max } = box;
  const width = max.z - min.z; // mặt rộng nhà (theo trục Z của model thật)
  const depth = max.x - min.x; // mặt sâu nhà (theo trục X của model thật)
  const height = max.y - 0; // tính từ cao độ ±0.000, bỏ qua phần móng âm dưới 0

  const nearX = min.x;
  const nearZ = min.z;
  const farX = max.x;
  const farZ = max.z;

  return (
    <group>
      {/* Chiều rộng — cạnh X=nearX, đẩy ra phía -X */}
      <DimensionLine
        from={[nearX, 0, nearZ]}
        to={[nearX, 0, farZ]}
        offsetDir={[-1, 0, 0]}
        offsetAmount={0.8}
        label={`Rộng ${fmt(width)}`}
      />

      {/* Chiều sâu — cạnh Z=farZ, đẩy ra phía +Z (đối diện cạnh chiều rộng) */}
      <DimensionLine
        from={[nearX, 0, farZ]}
        to={[farX, 0, farZ]}
        offsetDir={[0, 0, 1]}
        offsetAmount={0.8}
        label={`Sâu ${fmt(depth)}`}
      />

      {/* Tổng chiều cao — cạnh X=farX, đẩy ra phía +X (đối diện cạnh chiều rộng) */}
      <DimensionLine
        from={[farX, 0, nearZ]}
        to={[farX, max.y, nearZ]}
        offsetDir={[1, 0, 0]}
        offsetAmount={0.8}
        label={`Cao ${fmt(height)}`}
      />

      {/* Chiều cao từng tầng — cạnh Z=nearZ, đẩy ra phía -Z (đối diện cạnh chiều sâu) */}
      {FLOOR_LEVELS.map((level, i) => {
        const next = FLOOR_LEVELS[i + 1]?.z ?? max.y;
        const segHeight = next - level.z;
        if (segHeight <= 0) return null;
        return (
          <DimensionLine
            key={level.label}
            from={[nearX, level.z, nearZ]}
            to={[nearX, next, nearZ]}
            offsetDir={[0, 0, -1]}
            offsetAmount={0.8}
            label={`${level.label}: ${fmt(segHeight)}`}
          />
        );
      })}
    </group>
  );
}
