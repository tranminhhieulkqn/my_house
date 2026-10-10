# Model 3D thật của nhà

`house.glb` là model THẬT của ngôi nhà, trích xuất từ file SketchUp gốc
(`resources/3d/sketchup/house_source.skp`) thông qua bản xuất HTML viewer
(`resources/html/house_source.html`, tạo bởi "Innerscene 3D Viewer" — nhúng sẵn
toàn bộ hình học dưới dạng GLB mã hoá base64).

Được load trực tiếp bởi [src/components/Scene/HouseModel.tsx](../../src/components/Scene/HouseModel.tsx)
qua `useGLTF`, không còn dùng mô hình dựng tham số (hộp/box ước lượng) nữa.

## Cập nhật khi có bản SketchUp mới

Khi có bản `.skp` mới xuất ra `.html` tương tự, trích xuất lại GLB bằng cách
tìm thẻ `<script type="application/octet-stream" id="isv-model">` trong file
HTML, lấy phần sau `data:model/gltf-binary;base64,` rồi giải mã base64 và ghi
đè vào `house.glb`:

```python
import re, base64
html = open("resources/html/house_source.html", encoding="utf-8").read()
start = html.find('id="isv-model"'); start = html.find(">", start) + 1
end = html.find("</script>", start)
b64 = html[start:end].split("base64,", 1)[1]
open("app/public/models/house.glb", "wb").write(base64.b64decode(b64))
```

## Vật liệu tùy biến

Model có 8 vật liệu gốc từ SketchUp; 4 vật liệu được ánh xạ sang bảng màu
tùy biến trong `src/components/Scene/HouseModel.tsx` (`MATERIAL_MAP`):
`[Brick Antique 01]` → tường gạch, `[Translucent Glass Gold]` → kính cửa sổ,
`432` → gỗ, `Color M05` → bê tông/đá. Vật liệu `SKP Vertex Colors` (phần lớn
khối tường/sàn, tô theo màu từng vertex) và vật liệu ngữ cảnh khác (đường,
khối phụ bên cạnh...) giữ nguyên theo bản gốc.

## Đã cắt bỏ 1 khối nhà thừa

File `house_source.skp`/HTML gốc thực chất chứa **2 khối nhà** (có lẽ 2 phương án
thiết kế hoặc nhà kế bên), gộp chung vào cùng mesh theo vật liệu nên không
thể xoá bằng cách bỏ 1 node. Đã xác nhận qua histogram tọa độ X từng mesh:
2 cụm tách biệt rõ ràng ở x=[0,8] (có mặt đường, có phòng mái gạch — khớp
với các bản vẽ mặt đứng AB/BC) và x=[26,34] (không có mặt đường, không có
phòng mái). Theo yêu cầu người dùng, đã giữ cụm x=[0,8] (có đường ở mặt
tiền) và cắt bỏ cụm còn lại bằng `scripts/split_glb_by_x.py`:

```bash
python3 scripts/split_glb_by_x.py house_full.glb app/public/models/house.glb 18 --keep below
```

Nếu nhận bản export mới cũng gặp tình trạng tương tự (nhiều khối gộp
chung), in histogram tọa độ X của từng mesh trước để xác định ranh giới an
toàn (không có tam giác nào nằm giữa 2 cụm) rồi mới chạy script trên.

## Đã chuyển cửa sổ mặt B (tầng 1) sang 2 cửa sổ mặt C

Theo yêu cầu: cửa sổ mặt ngoài ở mặt B tầng 1 được bịt kín, thay bằng 2 cửa
sổ mới ở mặt ngoài C — cùng kích thước/chiều cao với cửa sổ mặt B cũ. Vì đây
là thay đổi hình học THẬT (lỗ cửa sổ là lỗ hổng tam giác thật trong mesh
thân nhà `SKP Vertex Colors`, không phải dữ liệu riêng trong code), không
thể sửa bằng cách đổi số liệu trong `src/` — phải sửa trực tiếp `house.glb`
ở mức tam giác.

**Vị trí 2 cửa sổ mới (đã qua 2 lần chỉnh theo phản hồi):**
bản đầu đặt thẳng theo toạ độ 2 cửa sổ mặt A — nhưng 2 cửa sổ mặt A vốn
không đối xứng (rộng khác nhau, lệch tâm), nên kết quả bị lệch hẳn về 1 bên
mặt C. Đã sửa lại theo yêu cầu: giữ nguyên chiều cao, 1 cửa sổ thẳng trục
dọc (cùng tâm z) với cửa sổ đã có sẵn ở mặt C — cùng tầng (Tầng 1), nhưng ở
mặt phẳng tường LÙI VÀO PHÍA TRONG (vùng cầu thang/giếng trời, `extractWallRegions()`
đặt id `C2-2`/`C2-3` cho các mặt phẳng lùi này, khác với `C2`/`C2a..e` là mặt
tường ngoài cùng) — cửa sổ còn lại lấy đối xứng gương qua tâm mặt C, nhờ vậy
lề trái và lề phải (khoảng cách từ mép cửa sổ ngoài cùng tới 2 cạnh tường)
bằng nhau tuyệt đối.

**Lưu ý đã sửa sai sót ở lần chỉnh đầu:** ban đầu tưởng cửa/cửa sổ cần thẳng
trục là ở "mặt C tầng 2 (sân thượng)" — gọi vậy vì nhầm, nhà chỉ có 3 tầng
(Tầng trệt/Tầng 1/Sân thượng, `bandIndex` 1/2/3). Toạ độ z=-3.965 dùng để
thẳng trục thực ra khớp với cửa sổ Ở TẦNG 1 (bandIndex 2), vùng tường lùi
`C2-3` (xác nhận lại bằng cách dò trực tiếp vertex: lỗ cửa đó có biên THẬT
đúng z=[-4.68,-3.25] — khớp tuyệt đối từng mm với z=-3.965±0.715 đã dùng,
và y=[4.893,6.471] — đúng chiều cao cửa sổ đang cắt). Tên gọi "sân thượng"
trong lịch sử chỉnh sửa trước đây là nhầm lẫn, nhưng toạ độ dùng vẫn đúng vì
giếng cầu thang xuyên suốt nhiều tầng nên các lỗ cửa dọc theo nó thẳng trục
nhau kể cả khi nhầm tầng.

1. Xác định toạ độ thật bằng cách tạm expose `window.__wallRegionsDebug`
   trong `WallRegionPainter.tsx` (dump `extractWallRegions()` ra ngoài), đọc
   qua trình duyệt headless (CDP) trong lúc app đang chạy — đối chiếu thêm
   với `resources/photos/technical_drawings/mat_AB.png`/`mat_BC.png`. Vị trí
   cửa ở vùng tường lùi `C2-3` cần dò riêng bằng vertex GỐC (loại trừ vertex
   do lần sửa mặt ngoài C tạo ra, kẻo lẫn toạ độ) vì `extractWallRegions()`
   gộp cụm gần đúng (sai số vài cm do lưới rasterize `RECT_CELL_SIZE=0.12`)
   — nên lấy trực tiếp toạ độ vertex biên thật của lỗ đó làm chuẩn.
2. Dùng `scripts/move_window_B_to_C_floor1.py` để: (a) bịt lỗ mặt B — 4 đỉnh
   biên của lỗ đó đã có sẵn trong mesh (chỉ cần nối 2 tam giác mới, không cần
   đỉnh mới); (b) cắt 2 lỗ mới vào mặt C — mặt C vốn là 1-2 tam giác rất lớn
   phủ cả bức tường (không có sẵn đường biên ở vị trí cửa sổ mới), nên phải
   cắt tam giác thật (thuật toán Sutherland-Hodgman clip tam giác theo 4 cạnh
   hình chữ nhật cửa sổ, giữ lại phần NGOÀI hình chữ nhật, fan-triangulate kết
   quả) thay vì chỉ xoá tam giác theo tâm (sẽ cắt hụt/cắt lố vì tam giác gốc
   quá lớn so với kích thước cửa sổ).
3. Kiểm chứng lại bằng ảnh chụp Playwright (góc nhìn "Mặt B"/"Mặt C" —
   `CameraPresetController.tsx`) VÀ dump lại `extractWallRegions()` sau khi
   sửa, xác nhận mặt B gộp lại thành 1 vùng liền (hết lỗ), mặt C xuất hiện
   đúng 2 vùng rời ở vị trí/kích thước mong muốn, VÀ lề trái/phải bằng nhau.

Script giữ lại chỉ để tham khảo cách làm — không tự chạy lại trên
`house.glb` hiện tại (xem chú thích đầu file script).
