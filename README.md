# My House 3D

Dự án tái tạo ngôi nhà bằng mô hình 3D tương tác trên web, từ bản vẽ kỹ thuật, hình ảnh thực tế và file SketchUp/AutoCAD gốc. Xem kế hoạch chi tiết tại [docs/PLAN.md](docs/PLAN.md) và lịch sử dữ liệu tại [docs/DU-LIEU-BAN-VE.md](docs/DU-LIEU-BAN-VE.md).

## Cấu trúc thư mục

```
my_house/
├── docs/                   # Tài liệu kế hoạch, ghi chú
├── resources/
│   ├── drawings/           # Bản vẽ kỹ thuật kết cấu: mặt bằng, mặt đứng, mặt cắt
│   ├── photos/
│   │   └── technical_drawings/  # Ảnh phối cảnh 3D có ghi kích thước (mặt đứng)
│   ├── 3d/
│   │   ├── sketchup/       # File .skp gốc
│   │   └── autocad/        # File .dwg gốc
│   └── html/                # Bản xuất HTML xem 3D (nhúng sẵn GLB) — nguồn model thật
└── app/                     # Web app (React + Three.js)
    ├── public/models/       # house.glb — trích từ resources/html, xem README ở đó
    └── src/
        ├── components/Scene/  # HouseModel (load GLB), Dimensions (đường gióng kích thước), FacadeLabels (nhãn mặt A/B/C/D), Environment (bầu trời/ánh sáng/thời tiết)
        ├── components/UI/     # Panel điều khiển tùy biến
        ├── store/              # State tùy biến (zustand): màu vật liệu, thời tiết, mùa, giờ
        └── types/              # Kiểu dữ liệu dùng chung
```

## Chạy thử (dev)

```bash
cd app
npm install   # nếu chưa cài
npm run dev
```

Mở trình duyệt theo địa chỉ Vite in ra (mặc định http://localhost:5173).

**Lưu ý phiên bản `three`**: dự án dùng `three.quarks` + binding React `quarks.r3f` cho hiệu ứng mưa (xem bên dưới), yêu cầu `three >= 0.182` nên `three`/`@types/three` đã nâng từ `^0.169.0` lên `^0.186.x`. Đã kiểm tra `@react-three/fiber@8.17`/`@react-three/drei@9.114` khai báo peer dependency chấp nhận phiên bản `three` mới hơn (`>=0.133`/`>=0.137`) nên không cần nâng cấp React/R3F. Đã so sánh ảnh chụp scene trước/sau khi nâng để xác nhận không lệch màu/ánh sáng. Thư viện `wawa-vfx` (lựa chọn ban đầu) KHÔNG dùng được vì yêu cầu cứng React 19 + `@react-three/fiber` v9 + `zustand` v5 — nâng cấp lớn, rủi ro cao, không phù hợp cho 1 hiệu ứng mưa.

Model hiển thị là model THẬT (`app/public/models/house.glb`), trích xuất từ `resources/html/house_source.html`. Xem [app/public/models/README.md](app/public/models/README.md) để biết cách trích xuất lại khi có bản SketchUp mới.

Panel bên phải có mục "Hiển thị → Kích thước" để bật/tắt đường gióng kích thước tổng thể (rộng/sâu/cao) và chiều cao từng tầng, hiển thị trực tiếp trong scene 3D (component `Dimensions.tsx`). Kích thước tổng lấy từ bounding box thật của model; chiều cao từng tầng lấy từ số liệu đã xác nhận trong bản vẽ kết cấu + mặt đứng (xem chú thích trong `Dimensions.tsx`).

Mục "Nhãn mặt nhà (A/B/C/D)" bật/tắt nhãn 4 mặt nhà (`FacadeLabels.tsx`): A = mặt trước (có cửa chính, hướng ra đường) → D → C (sau) → B, đi vòng quanh nhà. Mỗi mặt chia theo tầng (vd A1/A2/A3 = tầng trệt/tầng 1/sân thượng) — `src/utils/extractWallRegions.ts` quét toàn bộ tam giác tường thật (cả mesh thân nhà chính dùng vertex color LẪN mesh ốp gạch phòng sân thượng dùng material riêng — xem `findWallRegionMeshes` trong `HouseModel.tsx`), gộp các tam giác CÙNG hướng mặt ngoài (theo pháp tuyến thật trong model, có kiểm tra vị trí tương đối tâm nhà để loại bỏ mặt trong của tường trùng pháp tuyến với 1 mặt khác) và CÙNG tầng thành 1 vùng. Trong mỗi mặt + tầng đó, nếu có 2 nhóm toạ độ mặt phẳng cách nhau rõ rệt (gấp khúc — vd tường chính và tường lùi vào phía trong ban công), mỗi nhóm tách thành 1 vùng riêng (hậu tố "-2", "-3"...); các cụm diện tích quá nhỏ (gờ, má cửa, bậc tam cấp...) tự gộp vào cụm liền kề thay vì thành vùng riêng (ngưỡng diện tích tối thiểu — xem `MIN_REGION_AREA`). Nhờ vậy tường thật sự đồng phẳng vẫn gộp làm một, nhưng các đoạn tường bị thụt vào/lồi ra rõ rệt (vd tường phía trong ban công sân thượng, tường nhô ra ở cầu thang/trụ) được tách ra thành vùng chọn riêng — TOÀN BỘ tường tiếp xúc bên ngoài, mọi tầng, đều chọn/tuỳ biến được, không còn vùng nào bị khoá cứng.

Mỗi cụm mặt phẳng còn được chia tiếp thành số lượng hình chữ nhật ÍT NHẤT có thể bao quanh các lỗ cửa sổ/cửa đi/bậc tam cấp (rasterize + chọn tham lam hình chữ nhật lớn nhất, ưu tiên chiều ngang — xem `decomposeIntoRectangles`), đặt tên hậu tố chữ cái (A2a, A2b...) khi mặt phẳng có nhiều hơn 1 hình chữ nhật. Vùng hover/chọn dùng đúng hình tam giác thật đã cắt theo ranh giới hình chữ nhật (Sutherland-Hodgman, `src/utils/clipPolygonToRect.ts`), không phải 1 mặt phẳng hình chữ nhật phủ cả vùng, nên rê chuột vào lỗ cửa sổ/cửa đi hoặc phần tường thuộc vùng khác sẽ không bị tính nhầm.

Mục "Đổ bóng" bật/tắt đổ bóng (shadow map) của đèn mặt trời lên nhà và mặt đất — tắt khi cần xem nhà không bị các vệt bóng đổ che màu thật, hoặc để tăng tốc hiển thị. Mục "Hiệu ứng thời tiết" khi tắt sẽ bỏ qua ảnh hưởng của lựa chọn "Thời tiết" lên bầu trời/ánh sáng/sương mù (luôn hiển thị như trời nắng), chỉ còn "Giờ trong ngày" ảnh hưởng tới cảnh — các nút thời tiết vẫn chọn được nhưng không đổi hình cho tới khi bật lại.

Khi chọn thời tiết "Mưa" (và "Hiệu ứng thời tiết" đang bật), cảnh hiện hiệu ứng mưa rơi thật bằng particle (`Rain.tsx`), dùng thư viện `three.quarks` + binding React `quarks.r3f` (xem phần "Thư viện dùng thêm" bên dưới). Hạt mưa là billboard kéo dài theo hướng rơi (`RenderMode.StretchedBillBoard`), sinh liên tục từ 1 mặt phẳng lưới nằm ngang phía trên nóc nhà, rơi thẳng xuống với tốc độ không đổi (không mô phỏng gia tốc trọng lực vì quãng đường rơi trong cảnh quá ngắn để thấy khác biệt). Tắt "Hiệu ứng thời tiết" hoặc đổi sang thời tiết khác sẽ ẩn mưa ngay (gỡ hẳn khỏi scene, không chỉ ẩn) để không tốn tài nguyên khi không cần.

Vị trí mặt trời (nắng/bóng đổ, hoàng hôn-bình minh) tính theo toạ độ (mặc định là giá trị MẪU, xem `src/data/geoLocation.ts` để đổi thành toạ độ thật của nhà bạn) kết hợp giờ ("Giờ trong ngày") và ngày đại diện theo "Mùa" đã chọn, bằng công thức xấp xỉ vị trí mặt trời NOAA (`src/data/geoLocation.ts`). Mặt C được quy ước hướng ra biển (Đông), mặt A (đối diện) quay vào đất liền (Tây) — xem `FACADE_COMPASS_BEARING` trong file trên nếu cần chỉnh lại hướng la bàn thật. Nhờ vậy mặt trời mọc đúng phía mặt C và lặn phía mặt A, góc/độ cao mặt trời cũng đổi theo mùa đúng với vĩ độ thật (vd trưa mùa hạ mặt trời gần như đứng bóng và hơi lệch về phía Bắc do vĩ độ 15°B thấp hơn chí tuyến Bắc) thay vì quỹ đạo cố định như trước. Ngưỡng chuyển ngày/đêm cũng tính theo độ cao mặt trời thật (dưới đường chân trời ~2°) thay vì mốc giờ cố định.

Mục "Nhà hàng xóm sát vách (mặt C, D)" bật/tắt khối nhà dân liền kề ở 2 mặt C (sau) và D (phải) — ngoài thực tế 2 mặt này xây sát vách (không lùi), nhà hàng xóm che khuất tường tầng trệt nên được biểu diễn đơn giản bằng 1 khối hộp mờ trắng (bóng mờ, opacity 70%, không tô màu thật vì không có dữ liệu — `NeighboringHouses.tsx`). Cả 2 khối đều trải đúng hết chiều rộng/chiều sâu thật của nhà chính (bounding box, kể cả phần tường/bậc tam cấp nhô ra) nên thẳng hàng hoàn toàn, không có khoảng hở, với cả 2 mặt lân cận của nhà chính (khối mặt C thẳng hàng với mặt B và D; khối mặt D thẳng hàng với mặt A và C). Độ sâu (hướng ra ngoài, vuông góc mặt tường) của cả 2 khối lấy đúng bằng chiều sâu thật của nhà chính ("Sâu" trong Dimensions.tsx); đặt đáy đúng bằng mặt phẳng đáy thật của nhà chính (`box.min.y` từ `computeBuildingBox` — nền móng, thấp hơn cao độ ±0.000 dùng để ghi chiều cao tầng) nên không nổi lên trên lẫn chìm xuống dưới/đè lên mặt đường trong model (2 mặt phẳng này trùng cao độ nhau).

2 khối nhà hàng xóm có nhãn tên nổi phía trên mỗi khối (mặc định "Nhà hàng xóm (mặt C)"/"(mặt D)" — đổi tên thật trong `NeighboringHouses.tsx` nếu chạy riêng cho mình). Mỗi khối còn có 4 thẻ tròn A/B/C/D riêng đánh dấu 4 mặt của chính nó, dùng CHUNG quy ước hướng với nhà chính (A = mặt có pháp tuyến ra ngoài hướng +X, B = +Z, C = -X, D = -Z) để gọi tên nhất quán giữa các nhà. Khối này không nhận sự kiện chuột (`raycast` trả `null`) nên không chặn hover/chọn vùng tường thật phía sau khi đang hiện — tắt mục này để xem/tuỳ biến toàn bộ 2 mặt không bị che.

Mục "Góc nhìn" có 6 nút nhảy camera: "Mặt A/B/C/D" (nhìn thẳng vuông góc vào mặt đó, tự tính khoảng cách để vừa khung hình theo kích thước thật của nhà — `CameraPresetController.tsx`), "Trên xuống" (nhìn từ trên xuống mái) và "Mặc định" (quay lại đúng góc nhìn tự động ban đầu, gọi lại logic auto-fit có sẵn của `<Bounds>` qua `useBounds()` thay vì tính riêng). Camera animate mượt (ease in/out ~0.8s) từ vị trí hiện tại tới góc nhìn mới thay vì nhảy đột ngột; sau khi tới nơi vẫn xoay/zoom tự do bằng chuột như bình thường (OrbitControls không bị khoá).

**Tuỳ biến riêng từng vùng tường**: bấm vào 1 vùng (vd A1, A2a) để chọn (highlight xanh mờ), rồi trong panel "Tuỳ biến vùng tường" chọn 1 trong 2 kiểu hoàn thiện — nhập mã hex vào ô "Mã hex" (áp dụng ngay), HOẶC bấm "Ốp gạch" để ốp mẫu gạch men 60x60cm (ảnh gốc `resources/photos/metirials/image.png`, texture `app/public/textures/floor1-tile-60cm.png`, lặp lại đúng tỉ lệ thật qua UV toạ độ mét) — 2 lựa chọn loại trừ nhau, đổi lựa chọn nào thì mất lựa chọn kia, "Xoá tuỳ biến" trả vùng về màu gốc. Áp dụng được cho MỌI vùng đã chọn, kể cả vùng thuộc mesh gạch ốp phòng sân thượng (material riêng, trước đây chỉ đổi màu đồng loạt qua mục "Màu sắc → Tường gạch"). `WallRegionPainter.tsx` dựng lớp phủ hình học khớp chính xác phần tường trong vùng đã chọn rồi vẽ đè bằng material màu đặc hoặc texture gạch — phủ kín hoàn toàn (không loang như cách tô vertex ban đầu) và tự động tôn trọng lỗ cửa sổ/cửa đi có sẵn trong hình học gốc.

Mục "Xuất / Nhập cấu hình" (trong panel "Lưu tuỳ biến") xuất toàn bộ thông tin đã set — màu vật liệu, tuỳ biến từng vùng tường, thời tiết, mùa, giờ trong ngày, các mục hiện/ẩn (kích thước, nhãn mặt nhà, đổ bóng, hiệu ứng thời tiết, nhà hàng xóm) — ra 1 file `.json` để lưu hoặc gửi cho người khác, và nhập lại từ file đó (`exportConfig`/`importConfig` trong `useHouseStore.ts`). File xuất có `schema`/`version` để nhận diện đúng định dạng; khi nhập, từng trường được kiểm tra kiểu dữ liệu riêng — trường hợp lệ được áp dụng, trường sai/thiếu lặng lẽ dùng giá trị mặc định (không làm hỏng cả file), kèm thông báo tóm tắt số mục đã bỏ qua nếu có. File sai định dạng hẳn (không phải JSON, hoặc thiếu `schema` đúng) báo lỗi rõ ràng và không đổi gì trên trang.

## Quy trình cập nhật resource

1. Thả bản vẽ kỹ thuật vào `resources/drawings/`, ảnh/phối cảnh vào `resources/photos/`.
2. Thả file SketchUp/AutoCAD gốc vào `resources/3d/`.
3. Nếu có bản xuất HTML viewer (vd từ SketchUp) đặt vào `resources/html/` — đây là cách nhanh nhất để lấy đúng hình học thật (xem hướng dẫn trích xuất GLB trong `app/public/models/README.md`).
4. Mọi thay đổi model chỉ cần ghi đè `app/public/models/house.glb`, không cần sửa code render.
