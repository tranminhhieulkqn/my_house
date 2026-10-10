import { useEffect, useRef, useState } from "react";
import { useHouseStore } from "../../store/useHouseStore";
import type { CameraPreset, MaterialSlotId, Season, WeatherMode } from "../../types/house";

function normalizeHex(value: string): string | null {
  const trimmed = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(trimmed) ? `#${trimmed.toLowerCase()}` : null;
}

/** Xuất toàn bộ thông tin đã set (màu, tuỳ biến tường, thời tiết, mùa, giờ, các mục hiện/ẩn) ra file JSON, hoặc nhập lại từ file JSON đã xuất trước đó. */
function ConfigExportImport() {
  const exportConfig = useHouseStore((s) => s.exportConfig);
  const importConfig = useHouseStore((s) => s.importConfig);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const handleExport = () => {
    const config = exportConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `my-house-config-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại đúng file đó lần sau
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = importConfig(parsed);
      if (result.ok) {
        setMessage({
          kind: "success",
          text:
            result.warnings.length === 0
              ? "Đã nhập cấu hình thành công."
              : `Đã nhập cấu hình, bỏ qua ${result.warnings.length} mục không hợp lệ: ${result.warnings.join("; ")}`,
        });
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    } catch {
      setMessage({ kind: "error", text: "Không đọc được file — kiểm tra lại có đúng là file JSON hợp lệ không." });
    }
  };

  return (
    <section>
      <h3>Xuất / Nhập cấu hình</h3>
      <p className="hint">
        Xuất toàn bộ thông tin đã set (màu vật liệu, tuỳ biến tường, thời tiết, mùa, giờ, các mục hiện/ẩn) ra 1 file
        JSON để lưu/chia sẻ, hoặc nhập lại từ file đã xuất trước đó.
      </p>
      <div className="row">
        <button onClick={handleExport}>Xuất file JSON</button>
        <button onClick={handleImportClick}>Nhập từ file JSON</button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {message && (
        <p className="hint" style={{ color: message.kind === "error" ? "#ff6b6b" : undefined }}>
          {message.text}
        </p>
      )}
    </section>
  );
}

/** Chọn 1 vùng tường (A1, A2a...) trong scene 3D rồi đổi màu hex hoặc ốp gạch men riêng vùng đó. */
function WallRegionEditor() {
  const selected = useHouseStore((s) => s.selectedWallRegion);
  const setSelected = useHouseStore((s) => s.setSelectedWallRegion);
  const wallRegionFinishes = useHouseStore((s) => s.wallRegionFinishes);
  const setWallRegionColor = useHouseStore((s) => s.setWallRegionColor);
  const setWallRegionTile = useHouseStore((s) => s.setWallRegionTile);
  const clearWallRegionFinish = useHouseStore((s) => s.clearWallRegionFinish);

  const finish = selected ? wallRegionFinishes[selected] : undefined;
  const [hexInput, setHexInput] = useState("");

  useEffect(() => {
    setHexInput(finish?.kind === "color" ? finish.hex : "");
  }, [selected, finish]);

  return (
    <section>
      <h3>Tuỳ biến vùng tường</h3>
      {!selected ? (
        <p className="hint">Bấm vào 1 vùng tường trong mô hình 3D (vd A1, B2a...) để chọn.</p>
      ) : (
        <>
          <div className="row">
            <span>Đang chọn: {selected}</span>
            <button onClick={() => setSelected(null)}>Bỏ chọn</button>
          </div>
          <label className="row">
            <span>Mã hex</span>
            <input
              type="text"
              value={hexInput}
              placeholder="#rrggbb"
              onChange={(e) => {
                setHexInput(e.target.value);
                const normalized = normalizeHex(e.target.value);
                if (normalized) setWallRegionColor(selected, normalized);
              }}
            />
          </label>
          <div className="row">
            <span>Gạch men 60x60</span>
            <button className={finish?.kind === "tile" ? "active" : ""} onClick={() => setWallRegionTile(selected)}>
              {finish?.kind === "tile" ? "Đang ốp" : "Ốp gạch"}
            </button>
          </div>
          {finish && <button onClick={() => clearWallRegionFinish(selected)}>Xoá tuỳ biến</button>}
        </>
      )}
    </section>
  );
}

const MATERIAL_LABELS: Record<MaterialSlotId, string> = {
  wall: "Tường gạch",
  window: "Kính cửa sổ",
  wood: "Gỗ (cửa, lan can...)",
  concrete: "Bê tông / đá ốp",
};

const WEATHER_OPTIONS: { id: WeatherMode; label: string }[] = [
  { id: "sunny", label: "Nắng" },
  { id: "cloudy", label: "Âm u" },
  { id: "rainy", label: "Mưa" },
  { id: "night", label: "Đêm" },
];

const SEASON_OPTIONS: { id: Season; label: string }[] = [
  { id: "spring", label: "Xuân" },
  { id: "summer", label: "Hạ" },
  { id: "autumn", label: "Thu" },
  { id: "winter", label: "Đông" },
];

const CAMERA_PRESET_OPTIONS: { id: CameraPreset; label: string }[] = [
  { id: "default", label: "Mặc định" },
  { id: "A", label: "Mặt A" },
  { id: "B", label: "Mặt B" },
  { id: "C", label: "Mặt C" },
  { id: "D", label: "Mặt D" },
  { id: "top", label: "Trên xuống" },
];

export function ControlPanel() {
  const materialColors = useHouseStore((s) => s.materialColors);
  const setMaterialColor = useHouseStore((s) => s.setMaterialColor);
  const wallRegionFinishes = useHouseStore((s) => s.wallRegionFinishes);
  const resetCustomization = useHouseStore((s) => s.resetCustomization);
  const weather = useHouseStore((s) => s.weather);
  const setWeather = useHouseStore((s) => s.setWeather);
  const season = useHouseStore((s) => s.season);
  const setSeason = useHouseStore((s) => s.setSeason);
  const timeOfDay = useHouseStore((s) => s.timeOfDay);
  const setTimeOfDay = useHouseStore((s) => s.setTimeOfDay);
  const showDimensions = useHouseStore((s) => s.showDimensions);
  const setShowDimensions = useHouseStore((s) => s.setShowDimensions);
  const showFacadeLabels = useHouseStore((s) => s.showFacadeLabels);
  const setShowFacadeLabels = useHouseStore((s) => s.setShowFacadeLabels);
  const shadowsEnabled = useHouseStore((s) => s.shadowsEnabled);
  const setShadowsEnabled = useHouseStore((s) => s.setShadowsEnabled);
  const weatherEffectsEnabled = useHouseStore((s) => s.weatherEffectsEnabled);
  const setWeatherEffectsEnabled = useHouseStore((s) => s.setWeatherEffectsEnabled);
  const showNeighboringHouses = useHouseStore((s) => s.showNeighboringHouses);
  const setShowNeighboringHouses = useHouseStore((s) => s.setShowNeighboringHouses);
  const requestCameraView = useHouseStore((s) => s.requestCameraView);

  const customizationCount = Object.keys(wallRegionFinishes).length;

  return (
    <div className="control-panel">
      <section>
        <h3>Lưu tuỳ biến</h3>
        <p className="hint">
          Màu vật liệu và tuỳ biến từng vùng tường ({customizationCount} vùng đã chỉnh) tự động lưu vào trình duyệt
          — mở lại trang vẫn giữ nguyên.
        </p>
        <button onClick={() => resetCustomization()}>Khôi phục màu gốc</button>
      </section>

      <ConfigExportImport />

      <section>
        <h3>Hiển thị</h3>
        <label className="row">
          <span>Kích thước</span>
          <input
            type="checkbox"
            checked={showDimensions}
            onChange={(e) => setShowDimensions(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Nhãn mặt nhà (A/B/C/D)</span>
          <input
            type="checkbox"
            checked={showFacadeLabels}
            onChange={(e) => setShowFacadeLabels(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Đổ bóng</span>
          <input
            type="checkbox"
            checked={shadowsEnabled}
            onChange={(e) => setShadowsEnabled(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Hiệu ứng thời tiết</span>
          <input
            type="checkbox"
            checked={weatherEffectsEnabled}
            onChange={(e) => setWeatherEffectsEnabled(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Nhà hàng xóm sát vách (mặt C, D)</span>
          <input
            type="checkbox"
            checked={showNeighboringHouses}
            onChange={(e) => setShowNeighboringHouses(e.target.checked)}
          />
        </label>
      </section>

      <section>
        <h3>Góc nhìn</h3>
        <p className="hint">Nhảy camera tới nhìn thẳng 1 mặt nhà, từ trên xuống, hoặc quay lại góc nhìn ban đầu.</p>
        <div className="button-row">
          {CAMERA_PRESET_OPTIONS.map((opt) => (
            <button key={opt.id} onClick={() => requestCameraView(opt.id)}>
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Màu sắc</h3>
        {(Object.keys(materialColors) as MaterialSlotId[]).map((slot) => (
          <label key={slot} className="row">
            <span>{MATERIAL_LABELS[slot]}</span>
            <input
              type="color"
              value={materialColors[slot]}
              onChange={(e) => setMaterialColor(slot, e.target.value)}
            />
          </label>
        ))}
      </section>

      <WallRegionEditor />

      <section>
        <h3>Thời tiết</h3>
        <p className="hint">
          Vị trí mẫu: 15°B, 108.9°Đ (miền Trung Việt Nam) — mặt C hướng Đông, mặt A hướng Tây. Vị trí/góc mặt trời
          theo giờ và mùa bên dưới tính theo toạ độ này (đổi trong <code>src/data/geoLocation.ts</code> theo nhà
          thật của bạn).
        </p>
        {!weatherEffectsEnabled && (
          <p className="hint">Đang tắt "Hiệu ứng thời tiết" ở mục Hiển thị — chọn ở đây sẽ không đổi cảnh.</p>
        )}
        <div className="button-row">
          {WEATHER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={opt.id === weather ? "active" : ""}
              onClick={() => setWeather(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Mùa</h3>
        <div className="button-row">
          {SEASON_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={opt.id === season ? "active" : ""}
              onClick={() => setSeason(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Giờ trong ngày: {timeOfDay}:00</h3>
        <input
          type="range"
          min={0}
          max={23}
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(Number(e.target.value))}
        />
      </section>
    </div>
  );
}
