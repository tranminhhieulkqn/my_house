import { Sky, Stars } from "@react-three/drei";
import { useMemo } from "react";
import { useHouseStore } from "../../store/useHouseStore";
import { compassBearingToLocalXZ, getSolarPosition } from "../../data/geoLocation";

/**
 * Derives sun position, light color/intensity and sky params from timeOfDay +
 * weather — vị trí mặt trời tính theo toạ độ thật của nhà (`geoLocation.ts`),
 * không còn là quỹ đạo giả định cố định: mặt trời mọc đúng phía mặt C (Đông,
 * hướng ra biển) và lặn phía mặt A (Tây), độ cao mặt trời cũng biến thiên
 * theo "Mùa" đúng với vĩ độ thật thay vì cố định cho mọi mùa.
 */
export function HouseEnvironment() {
  const weather = useHouseStore((s) => s.weather);
  const season = useHouseStore((s) => s.season);
  const timeOfDay = useHouseStore((s) => s.timeOfDay);
  const weatherEffectsEnabled = useHouseStore((s) => s.weatherEffectsEnabled);
  const shadowsEnabled = useHouseStore((s) => s.shadowsEnabled);

  // Khi tắt "hiệu ứng thời tiết", bầu trời/ánh sáng/sương mù luôn xử lý như
  // trời nắng, chỉ còn giờ trong ngày (timeOfDay) ảnh hưởng tới cảnh.
  const effectiveWeather = weatherEffectsEnabled ? weather : "sunny";

  const solar = useMemo(() => getSolarPosition(season, timeOfDay), [season, timeOfDay]);
  // Mặt trời dưới đường chân trời hơn ~2° (hoàng hôn dân dụng) coi như đêm,
  // thay cho ngưỡng giờ cố định (5.5h/19h) trước đây — tự khớp theo mùa/vĩ độ.
  const isNight = effectiveWeather === "night" || solar.elevationDeg < -2;

  const sunPosition = useMemo<[number, number, number]>(() => {
    const elevationRad = (Math.max(solar.elevationDeg, -0.1) * Math.PI) / 180;
    const { x, z } = compassBearingToLocalXZ(solar.azimuthDeg);
    const horizontalRadius = Math.cos(elevationRad) * 50;
    return [x * horizontalRadius, Math.sin(elevationRad) * 50, z * horizontalRadius];
  }, [solar]);

  const lightIntensity = useMemo(() => {
    if (isNight) return 0.15;
    if (effectiveWeather === "cloudy" || effectiveWeather === "rainy") return 0.6;
    return 1.4;
  }, [isNight, effectiveWeather]);

  const ambientIntensity = isNight ? 0.1 : 0.4;

  return (
    <>
      {!isNight && (
        <Sky
          sunPosition={sunPosition}
          turbidity={effectiveWeather === "cloudy" || effectiveWeather === "rainy" ? 10 : 2}
          rayleigh={effectiveWeather === "rainy" ? 4 : 1}
        />
      )}
      {isNight && (
        <>
          <color attach="background" args={["#060616"]} />
          <Stars radius={100} depth={50} count={2000} factor={4} fade />
        </>
      )}

      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        position={sunPosition}
        intensity={lightIntensity}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-camera-far={120}
      />

      {(effectiveWeather === "cloudy" || effectiveWeather === "rainy") && (
        <fog attach="fog" args={["#aab4bd", 10, 45]} />
      )}
    </>
  );
}
