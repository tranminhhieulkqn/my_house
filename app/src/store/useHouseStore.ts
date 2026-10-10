import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CameraPreset, MaterialSlotId, Season, WeatherMode } from "../types/house";

export type WallFinish = { kind: "color"; hex: string } | { kind: "tile" };

const DEFAULT_MATERIAL_COLORS: Record<MaterialSlotId, string> = {
  wall: "#936947",
  window: "#fffe1a",
  wood: "#733e2e",
  concrete: "#8d7c6a",
};

const MATERIAL_SLOT_IDS: MaterialSlotId[] = ["wall", "window", "wood", "concrete"];
const WEATHER_MODES: WeatherMode[] = ["sunny", "cloudy", "rainy", "night"];
const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

const CONFIG_SCHEMA = "my-house-3d-config";
const CONFIG_VERSION = 1;

/** Toàn bộ "thông tin đã set" có thể xuất/nhập qua file JSON (mục Xuất/Nhập cấu hình). */
export interface HouseConfigFile {
  schema: typeof CONFIG_SCHEMA;
  version: typeof CONFIG_VERSION;
  exportedAt: string;
  materialColors: Record<MaterialSlotId, string>;
  wallRegionFinishes: Record<string, WallFinish>;
  weather: WeatherMode;
  season: Season;
  timeOfDay: number;
  showDimensions: boolean;
  showFacadeLabels: boolean;
  shadowsEnabled: boolean;
  weatherEffectsEnabled: boolean;
  showNeighboringHouses: boolean;
}

export type ImportConfigResult = { ok: true; warnings: string[] } | { ok: false; error: string };

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function isWallFinish(v: unknown): v is WallFinish {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.kind === "tile") return true;
  if (o.kind === "color") return isHexColor(o.hex);
  return false;
}

function sanitizeMaterialColors(raw: unknown, warnings: string[]): Record<MaterialSlotId, string> {
  const result = { ...DEFAULT_MATERIAL_COLORS };
  if (raw && typeof raw === "object") {
    for (const slot of MATERIAL_SLOT_IDS) {
      const v = (raw as Record<string, unknown>)[slot];
      if (v === undefined) continue;
      if (isHexColor(v)) result[slot] = v;
      else warnings.push(`Bỏ qua màu không hợp lệ cho vật liệu "${slot}"`);
    }
  }
  return result;
}

function sanitizeWallRegionFinishes(raw: unknown, warnings: string[]): Record<string, WallFinish> {
  const result: Record<string, WallFinish> = {};
  if (raw && typeof raw === "object") {
    for (const [region, finish] of Object.entries(raw as Record<string, unknown>)) {
      if (isWallFinish(finish)) result[region] = finish;
      else warnings.push(`Bỏ qua tuỳ biến không hợp lệ cho vùng tường "${region}"`);
    }
  }
  return result;
}

function sanitizeEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function sanitizeBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function sanitizeTimeOfDay(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.min(24, Math.max(0, raw)) : 12;
}

interface HouseState {
  materialColors: Record<MaterialSlotId, string>;
  weather: WeatherMode;
  season: Season;
  timeOfDay: number; // 0-24h
  showDimensions: boolean;
  showFacadeLabels: boolean;
  shadowsEnabled: boolean;
  weatherEffectsEnabled: boolean; // tắt = bỏ qua ảnh hưởng của `weather` lên bầu trời/ánh sáng/sương mù
  showNeighboringHouses: boolean; // nhà dân xây sát vách ở mặt C, D (che khuất tầng trệt ngoài thực tế)
  selectedWallRegion: string | null; // vd "A2a"
  wallRegionFinishes: Record<string, WallFinish>; // override theo từng vùng tường: màu hex hoặc ốp gạch
  // Yêu cầu đổi góc nhìn camera (nút "Góc nhìn" trong panel) — `nonce` đổi mỗi
  // lần bấm (kể cả bấm lại cùng 1 mặt) để `CameraPresetController` luôn nhận
  // ra yêu cầu mới và animate lại từ vị trí camera hiện tại.
  cameraRequest: { preset: CameraPreset; nonce: number } | null;
  setMaterialColor: (slot: MaterialSlotId, color: string) => void;
  setWeather: (weather: WeatherMode) => void;
  setSeason: (season: Season) => void;
  setTimeOfDay: (hour: number) => void;
  setShowDimensions: (show: boolean) => void;
  setShowFacadeLabels: (show: boolean) => void;
  setShadowsEnabled: (enabled: boolean) => void;
  setWeatherEffectsEnabled: (enabled: boolean) => void;
  setShowNeighboringHouses: (show: boolean) => void;
  requestCameraView: (preset: CameraPreset) => void;
  setSelectedWallRegion: (region: string | null) => void;
  setWallRegionColor: (region: string, hex: string) => void;
  setWallRegionTile: (region: string) => void;
  clearWallRegionFinish: (region: string) => void;
  resetCustomization: () => void;
  exportConfig: () => HouseConfigFile;
  importConfig: (raw: unknown) => ImportConfigResult;
}

// Màu vật liệu + tuỳ biến từng vùng tường được lưu vào localStorage (qua
// `persist`), nên người dùng đóng tab/mở lại trình duyệt vẫn giữ nguyên tuỳ
// biến đã chỉnh — không cần thao tác lưu thủ công. Các lựa chọn hiển thị
// nhanh (thời tiết, mùa, giờ, hiện/ẩn...) không lưu, luôn khởi động lại mặc
// định cho mỗi phiên xem.
export const useHouseStore = create<HouseState>()(
  persist(
    (set, get) => ({
      materialColors: { ...DEFAULT_MATERIAL_COLORS },
      weather: "sunny",
      season: "summer",
      timeOfDay: 12,
      showDimensions: true,
      showFacadeLabels: true,
      shadowsEnabled: true,
      weatherEffectsEnabled: true,
      showNeighboringHouses: true,
      selectedWallRegion: null,
      wallRegionFinishes: {},
      cameraRequest: null,
      setMaterialColor: (slot, color) =>
        set((state) => ({
          materialColors: { ...state.materialColors, [slot]: color },
        })),
      setWeather: (weather) => set({ weather }),
      setSeason: (season) => set({ season }),
      setTimeOfDay: (hour) => set({ timeOfDay: hour }),
      setShowDimensions: (show) => set({ showDimensions: show }),
      setShowFacadeLabels: (show) => set({ showFacadeLabels: show }),
      setShadowsEnabled: (enabled) => set({ shadowsEnabled: enabled }),
      setWeatherEffectsEnabled: (enabled) => set({ weatherEffectsEnabled: enabled }),
      setShowNeighboringHouses: (show) => set({ showNeighboringHouses: show }),
      requestCameraView: (preset) =>
        set((state) => ({ cameraRequest: { preset, nonce: (state.cameraRequest?.nonce ?? 0) + 1 } })),
      setSelectedWallRegion: (region) => set({ selectedWallRegion: region }),
      setWallRegionColor: (region, hex) =>
        set((state) => ({ wallRegionFinishes: { ...state.wallRegionFinishes, [region]: { kind: "color", hex } } })),
      setWallRegionTile: (region) =>
        set((state) => ({ wallRegionFinishes: { ...state.wallRegionFinishes, [region]: { kind: "tile" } } })),
      clearWallRegionFinish: (region) =>
        set((state) => {
          const next = { ...state.wallRegionFinishes };
          delete next[region];
          return { wallRegionFinishes: next };
        }),
      resetCustomization: () =>
        set({ materialColors: { ...DEFAULT_MATERIAL_COLORS }, wallRegionFinishes: {} }),
      exportConfig: () => {
        const s = get();
        return {
          schema: CONFIG_SCHEMA,
          version: CONFIG_VERSION,
          exportedAt: new Date().toISOString(),
          materialColors: s.materialColors,
          wallRegionFinishes: s.wallRegionFinishes,
          weather: s.weather,
          season: s.season,
          timeOfDay: s.timeOfDay,
          showDimensions: s.showDimensions,
          showFacadeLabels: s.showFacadeLabels,
          shadowsEnabled: s.shadowsEnabled,
          weatherEffectsEnabled: s.weatherEffectsEnabled,
          showNeighboringHouses: s.showNeighboringHouses,
        };
      },
      importConfig: (raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          return { ok: false, error: "File JSON không hợp lệ (nội dung không phải object)." };
        }
        const data = raw as Record<string, unknown>;
        if (data.schema !== CONFIG_SCHEMA) {
          return { ok: false, error: "File JSON không đúng định dạng cấu hình của My House 3D." };
        }

        const warnings: string[] = [];
        const materialColors = sanitizeMaterialColors(data.materialColors, warnings);
        const wallRegionFinishes = sanitizeWallRegionFinishes(data.wallRegionFinishes, warnings);
        const weather = sanitizeEnum(data.weather, WEATHER_MODES, "sunny");
        const season = sanitizeEnum(data.season, SEASONS, "summer");
        const timeOfDay = sanitizeTimeOfDay(data.timeOfDay);
        const showDimensions = sanitizeBoolean(data.showDimensions, true);
        const showFacadeLabels = sanitizeBoolean(data.showFacadeLabels, true);
        const shadowsEnabled = sanitizeBoolean(data.shadowsEnabled, true);
        const weatherEffectsEnabled = sanitizeBoolean(data.weatherEffectsEnabled, true);
        const showNeighboringHouses = sanitizeBoolean(data.showNeighboringHouses, true);

        set({
          materialColors,
          wallRegionFinishes,
          weather,
          season,
          timeOfDay,
          showDimensions,
          showFacadeLabels,
          shadowsEnabled,
          weatherEffectsEnabled,
          showNeighboringHouses,
        });

        return { ok: true, warnings };
      },
    }),
    {
      name: "my-house-customization",
      partialize: (state) => ({
        materialColors: state.materialColors,
        wallRegionFinishes: state.wallRegionFinishes,
      }),
    },
  ),
);
