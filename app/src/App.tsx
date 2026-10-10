import { Scene } from "./components/Scene/Scene";
import { ControlPanel } from "./components/UI/ControlPanel";

export default function App() {
  return (
    <div className="app">
      <Scene />
      <ControlPanel />
    </div>
  );
}
