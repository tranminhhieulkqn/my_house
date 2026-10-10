export type FacadeId = "A" | "B" | "C" | "D";
export type Axis = "x" | "z";

export interface Facade {
  id: FacadeId;
  name: string;
  axis: Axis; // trục có tọa độ không đổi trên mặt này
  constant: number; // giá trị tọa độ không đổi (ước lượng từ bounding box, chỉ để đặt vị trí thẻ A/B/C/D)
  spanFrom: number; // khoảng trải theo trục còn lại (ngang), toàn bộ mặt
  spanTo: number;
  normalSign: 1 | -1; // hướng pháp tuyến (ra ngoài) theo trục `axis`
}

export interface FloorBand {
  index: 1 | 2 | 3;
  y0: number;
  y1: number;
  label: string;
}

/**
 * Mặt A = mặt trước, có cửa chính (mặt X=max). Thứ tự đi vòng quanh nhà:
 * A (trước) → D (phải) → C (sau, đối diện A) → B (trái) → quay lại A.
 * Chỉ dùng để đặt thẻ A/B/C/D cố định (FacadeBadge) — vùng chọn/tô màu thật
 * sự lấy từ hình học tường (xem `src/utils/extractWallRegions.ts`), không
 * phụ thuộc vào bounding box này vì các phần thụt vào/lồi ra theo tầng có
 * thể không nằm đúng mặt phẳng bounding box.
 */
export function buildFacades(min: { x: number; z: number }, max: { x: number; z: number }): Facade[] {
  return [
    { id: "A", name: "Mặt trước (cửa chính)", axis: "x", constant: max.x, spanFrom: min.z, spanTo: max.z, normalSign: 1 },
    { id: "B", name: "Mặt bên trái", axis: "z", constant: max.z, spanFrom: min.x, spanTo: max.x, normalSign: 1 },
    { id: "C", name: "Mặt sau", axis: "x", constant: min.x, spanFrom: min.z, spanTo: max.z, normalSign: -1 },
    { id: "D", name: "Mặt bên phải", axis: "z", constant: min.z, spanFrom: min.x, spanTo: max.x, normalSign: -1 },
  ];
}

// Cao độ từng tầng — cùng nguồn số liệu với Dimensions.tsx (bản vẽ kết cấu +
// mặt đứng kiến trúc đã xác nhận trước đó).
export function buildFloorBands(maxY: number): FloorBand[] {
  return [
    { index: 1, y0: 0, y1: 3.8, label: "Tầng trệt" },
    { index: 2, y0: 3.8, y1: 7.2, label: "Tầng 1" },
    { index: 3, y0: 7.2, y1: maxY, label: "Sân thượng / mái" },
  ];
}
