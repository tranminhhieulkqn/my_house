import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { HouseModel } from "./HouseModel";
import { HouseEnvironment } from "./Environment";
import { Dimensions } from "./Dimensions";
import { FacadeLabels } from "./FacadeLabels";
import { WallRegionPainter } from "./WallRegionPainter";
import { NeighboringHouses } from "./NeighboringHouses";
import { CameraPresetController } from "./CameraPresetController";
import { Rain } from "./Rain";
import { useHouseStore } from "../../store/useHouseStore";

export function Scene() {
  const shadowsEnabled = useHouseStore((s) => s.shadowsEnabled);

  return (
    <Canvas shadows={shadowsEnabled} camera={{ fov: 45 }}>
      <HouseEnvironment />
      <Bounds fit clip observe margin={1.6}>
        <HouseModel />
        <CameraPresetController />
      </Bounds>
      <WallRegionPainter />
      <NeighboringHouses />
      <Dimensions />
      <FacadeLabels />
      <Rain />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />

      {/* Nền đất, đặt thấp hơn mặt đường trong model (Y=-0.5) để không chồng hình */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]} receiveShadow={shadowsEnabled}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#6b8f55" />
      </mesh>
    </Canvas>
  );
}
