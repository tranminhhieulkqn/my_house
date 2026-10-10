// Các slot vật liệu ánh xạ tới tên vật liệu THẬT trong model SketchUp gốc
// (resources/3d/sketchup/house_source.skp, xuất qua resources/html/house_source.html).
// Xem MATERIAL_MAP trong components/Scene/HouseModel.tsx.
export type MaterialSlotId = "wall" | "window" | "wood" | "concrete";

export interface MaterialSlot {
  id: MaterialSlotId;
  label: string;
  color: string;
}

export type WeatherMode = "sunny" | "cloudy" | "rainy" | "night";

export type Season = "spring" | "summer" | "autumn" | "winter";

// "A"-"D" = nhìn thẳng vào mặt đó (cùng quy ước hướng A/B/C/D trong
// data/wallRegions.ts); "top" = nhìn từ trên xuống; "default" = quay lại góc
// nhìn tự động ban đầu (auto-fit của `<Bounds>`).
export type CameraPreset = "A" | "B" | "C" | "D" | "top" | "default";
