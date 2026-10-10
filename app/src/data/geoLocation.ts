import type { FacadeId } from "./wallRegions";
import type { Season } from "../types/house";

/**
 * Toạ độ dùng để tính vị trí mặt trời thật theo giờ/mùa, thay cho quỹ đạo
 * giả định cố định trước đây. Giá trị MẪU (miền Trung Việt Nam, UTC+7) —
 * đổi thành toạ độ thật của nhà bạn (và KHÔNG commit giá trị thật lên repo
 * public) để tính nắng đúng vị trí thực tế.
 */
export const LATITUDE = 15.0;
export const LONGITUDE = 108.9;
export const TIMEZONE_OFFSET_HOURS = 7; // giờ Việt Nam (UTC+7), không đổi theo DST

/**
 * Hướng la bàn thật (độ, 0=Bắc, 90=Đông, 180=Nam, 270=Tây) mà pháp tuyến ra
 * ngoài của mỗi mặt hướng tới ngoài đời. Giá trị MẪU dưới đây giả định mặt C
 * quay ra hướng Đông; mặt A (đối diện C) do đó quay về hướng Tây, còn B/D
 * lấy Nam/Bắc để giữ đúng thứ tự đi vòng quanh nhà A→D→C→B (xem
 * `buildFacades`). Đổi lại theo hướng thật của nhà bạn nếu khác.
 */
export const FACADE_COMPASS_BEARING: Record<FacadeId, number> = {
  D: 0, // Bắc
  C: 90, // Đông
  B: 180, // Nam
  A: 270, // Tây
};

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// Ngày đại diện trong năm cho mỗi lựa chọn "Mùa" ở panel điều khiển — ảnh
// hưởng độ xiên thật của mặt trời theo vĩ độ (dùng lịch Bắc bán cầu vì 4 lựa
// chọn Xuân/Hạ/Thu/Đông trong UI theo quy ước này; nhiều vùng ở Việt Nam về
// khí hậu thực tế chỉ có mùa khô/mưa, nhưng độ cao mặt trời vẫn biến thiên
// đúng theo ngày trong năm bất kể tên gọi mùa).
const SEASON_REPRESENTATIVE_DAY_OF_YEAR: Record<Season, number> = {
  spring: 80, // ~21/3
  summer: 172, // ~21/6
  autumn: 266, // ~23/9
  winter: 355, // ~21/12
};

export interface SolarPosition {
  elevationDeg: number; // > 0 = trên đường chân trời
  azimuthDeg: number; // phương vị la bàn thật, 0=Bắc, 90=Đông..., theo chiều kim đồng hồ
}

/**
 * Vị trí mặt trời thật (độ cao + phương vị) theo công thức xấp xỉ NOAA, dùng
 * toạ độ thật của nhà, ngày đại diện theo mùa và giờ trong ngày (giờ địa
 * phương, 0-24h).
 */
export function getSolarPosition(season: Season, hour: number): SolarPosition {
  const dayOfYear = SEASON_REPRESENTATIVE_DAY_OF_YEAR[season] ?? 172;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);

  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const timeOffsetMin = eqTimeMin + 4 * LONGITUDE - 60 * TIMEZONE_OFFSET_HOURS;
  const trueSolarTimeMin = hour * 60 + timeOffsetMin;
  let hourAngleDeg = trueSolarTimeMin / 4 - 180;
  if (hourAngleDeg < -180) hourAngleDeg += 360;
  if (hourAngleDeg > 180) hourAngleDeg -= 360;
  const hourAngleRad = toRad(hourAngleDeg);

  const latRad = toRad(LATITUDE);
  const cosZenith =
    Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
  const zenithRad = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const elevationDeg = 90 - (zenithRad * 180) / Math.PI;

  const sinZenith = Math.sin(zenithRad) || 1e-9;
  let cosAzimuth = (Math.sin(declRad) - Math.sin(latRad) * Math.cos(zenithRad)) / (Math.cos(latRad) * sinZenith);
  cosAzimuth = Math.min(1, Math.max(-1, cosAzimuth));
  let azimuthDeg = (Math.acos(cosAzimuth) * 180) / Math.PI;
  if (hourAngleDeg > 0) azimuthDeg = 360 - azimuthDeg;

  return { elevationDeg, azimuthDeg };
}

/**
 * Quy đổi phương vị la bàn thật (độ, 0=Bắc...) sang vector ngang (x,z) trong
 * hệ toạ độ model. Mặt D (-Z) được chọn làm "Bắc cục bộ"; độ lệch giữa Bắc
 * thật và mặt D chính là `FACADE_COMPASS_BEARING.D`, trừ offset này trước khi
 * quy đổi — nếu sau này chỉnh lại hướng la bàn thật ở trên, ánh sáng tự cập
 * nhật theo mà không cần sửa công thức.
 */
export function compassBearingToLocalXZ(bearingDeg: number): { x: number; z: number } {
  const localBearingRad = toRad(bearingDeg - FACADE_COMPASS_BEARING.D);
  return { x: -Math.sin(localBearingRad), z: -Math.cos(localBearingRad) };
}
