import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useBounds, useGLTF } from "@react-three/drei";
import { computeBuildingBox, MODEL_URL } from "./HouseModel";
import { useHouseStore } from "../../store/useHouseStore";

// Chỉ dùng đúng phần API của OrbitControls cần thiết ở đây, tránh phụ thuộc
// kiểu `three-stdlib` (không phải dependency trực tiếp của project).
interface MinimalOrbitControls {
  target: THREE.Vector3;
  update: () => void;
}

const FACADE_AXIS: Record<"A" | "B" | "C" | "D", { axis: "x" | "z"; sign: 1 | -1 }> = {
  A: { axis: "x", sign: 1 }, // +X
  B: { axis: "z", sign: 1 }, // +Z
  C: { axis: "x", sign: -1 }, // -X
  D: { axis: "z", sign: -1 }, // -Z
};

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Lắng nghe yêu cầu đổi góc nhìn từ panel điều khiển (`cameraRequest` trong
 * store, mục "Góc nhìn") và animate OrbitControls tới vị trí tương ứng: nhìn
 * thẳng vào 1 trong 4 mặt A/B/C/D (đúng theo pháp tuyến ra ngoài đã quy ước
 * trong `wallRegions.ts`), nhìn từ trên xuống, hoặc "Mặc định" — gọi lại
 * đúng logic auto-fit có sẵn của `<Bounds>` (qua `useBounds()`) thay vì tự
 * tính toán lại, để khớp hệt góc nhìn lúc tải trang. Phải là con của
 * `<Bounds>` để dùng được `useBounds()`.
 */
export function CameraPresetController() {
  const { scene } = useGLTF(MODEL_URL);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controlsRaw = useThree((s) => s.controls);
  const bounds = useBounds();
  const cameraRequest = useHouseStore((s) => s.cameraRequest);

  const anim = useRef<{
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    elapsed: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (!cameraRequest) return;

    if (cameraRequest.preset === "default") {
      bounds.refresh().clip().fit();
      anim.current = null;
      return;
    }

    const controls = controlsRaw as unknown as MinimalOrbitControls | null;
    if (!controls) return;

    const box = computeBuildingBox(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const aspect = camera.aspect || window.innerWidth / window.innerHeight;
    const vFov = THREE.MathUtils.degToRad(camera.fov || 45);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distanceToFit = (width: number, height: number) =>
      Math.max(width / 2 / Math.tan(hFov / 2), height / 2 / Math.tan(vFov / 2)) * 1.25;

    const toPos = new THREE.Vector3();
    const toTarget = new THREE.Vector3(center.x, center.y, center.z);

    if (cameraRequest.preset === "top") {
      const distance = distanceToFit(size.x, size.z);
      // Lệch nhẹ theo Z thay vì thẳng đứng tuyệt đối, tránh trường hợp suy
      // biến hướng "up" của camera khi nhìn thẳng xuống.
      toPos.set(center.x, box.max.y + distance, center.z + distance * 0.2);
      toTarget.set(center.x, box.min.y, center.z);
    } else {
      const { axis, sign } = FACADE_AXIS[cameraRequest.preset];
      if (axis === "x") {
        const distance = distanceToFit(size.z, size.y);
        toPos.set(center.x + sign * (size.x / 2 + distance), center.y, center.z);
      } else {
        const distance = distanceToFit(size.x, size.y);
        toPos.set(center.x, center.y, center.z + sign * (size.z / 2 + distance));
      }
    }

    anim.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget,
      elapsed: 0,
      duration: 0.8,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRequest]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a) return;
    const controls = controlsRaw as unknown as MinimalOrbitControls | null;
    if (!controls) {
      anim.current = null;
      return;
    }
    a.elapsed += delta;
    const t = Math.min(a.elapsed / a.duration, 1);
    const eased = easeInOutCubic(t);
    camera.position.lerpVectors(a.fromPos, a.toPos, eased);
    controls.target.lerpVectors(a.fromTarget, a.toTarget, eased);
    controls.update();
    if (t >= 1) anim.current = null;
  });

  return null;
}
