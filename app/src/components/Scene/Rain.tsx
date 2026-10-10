import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { QuarksProvider, ParticleSystem } from "quarks.r3f";
import { GridEmitter, RenderMode, type StretchedBillBoardSettings } from "three.quarks";
import { computeBuildingBox, MODEL_URL } from "./HouseModel";
import { useHouseStore } from "../../store/useHouseStore";

// Vùng sinh mưa (vuông, mét) phủ quanh nhà, đủ rộng để thấy mưa rơi ở mọi góc
// camera thường dùng (các góc nhìn mặt A/B/C/D, trên xuống...).
const RAIN_AREA_SIZE = 30;
// Độ cao sinh mưa phía trên nóc nhà (mét) — đủ xa để hạt mưa đạt "tốc độ rơi"
// ổn định trước khi vào khung hình.
const RAIN_SPAWN_HEIGHT_ABOVE_ROOF = 14;
// Tốc độ rơi (m/s) — mưa thật rơi khá nhanh, không dùng trọng lực gia tốc mà
// lấy tốc độ không đổi cho đơn giản (sai khác không đáng kể ở quãng đường
// ngắn này).
const FALL_SPEED_RANGE: [number, number] = [12, 16];
const EMISSION_RATE = 450; // số hạt/giây

// Công thức thật của three.quarks (stretched_bb_particle_vert.glsl):
// độ dài vệt ≈ 0.5 * size * (speedFactor*speed + lengthFactor) — `lengthFactor`
// là phần nền (không phụ thuộc tốc độ), `speedFactor` cộng thêm chút theo tốc độ
// rơi để hạt nhanh hơn kéo vệt dài hơn 1 chút.
const RAIN_RENDERER_SETTINGS: StretchedBillBoardSettings = {
  speedFactor: 0.08,
  lengthFactor: 18,
};

/**
 * Hiệu ứng mưa thật (particle), chỉ hiện khi thời tiết đang chọn là "Mưa" và
 * "Hiệu ứng thời tiết" đang bật. Dùng `three.quarks` (qua binding
 * `quarks.r3f`) thay vì tự viết shader — xem trao đổi về thư viện hỗ trợ.
 * Hạt mưa là billboard kéo dài theo hướng rơi (`RenderMode.StretchedBillBoard`),
 * sinh ra từ 1 mặt phẳng lưới (`GridEmitter`) nằm ngang phía trên nóc nhà,
 * xoay 90° quanh trục X để hướng rơi mặc định (theo trục Z cục bộ của
 * `GridEmitter`) trỏ thẳng xuống dưới (-Y thế giới).
 */
export function Rain() {
  const { scene } = useGLTF(MODEL_URL);
  const weather = useHouseStore((s) => s.weather);
  const weatherEffectsEnabled = useHouseStore((s) => s.weatherEffectsEnabled);
  const isRaining = weatherEffectsEnabled && weather === "rainy";

  const box = useMemo(() => computeBuildingBox(scene), [scene]);

  const shape = useMemo(
    () => new GridEmitter({ width: RAIN_AREA_SIZE, height: RAIN_AREA_SIZE, column: 60, row: 60 }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffffff"),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const { emitterPosition, lifetimeRange } = useMemo(() => {
    const center = box.getCenter(new THREE.Vector3());
    const topY = box.max.y + RAIN_SPAWN_HEIGHT_ABOVE_ROOF;
    const fallDistance = topY - box.min.y;
    return {
      emitterPosition: [center.x, topY, center.z] as [number, number, number],
      lifetimeRange: [fallDistance / FALL_SPEED_RANGE[1], fallDistance / FALL_SPEED_RANGE[0]] as [number, number],
    };
  }, [box]);

  if (!isRaining) return null;

  return (
    <QuarksProvider>
      <ParticleSystem
        looping
        prewarm
        duration={1}
        shape={shape}
        emissionOverTime={EMISSION_RATE}
        startLife={lifetimeRange}
        startSpeed={FALL_SPEED_RANGE}
        startSize={[0.03, 0.05]}
        startColor={{ r: 1, g: 1, b: 1, a: 0.5 }}
        renderMode={RenderMode.StretchedBillBoard}
        rendererEmitterSettings={RAIN_RENDERER_SETTINGS}
        material={material}
        worldSpace={false}
        position={emitterPosition}
        rotation={[Math.PI / 2, 0, 0]}
        autoPlay
      />
    </QuarksProvider>
  );
}
