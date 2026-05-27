import { useDigitalTwinStore, type HotspotConfig, type TwinMapping } from "./digital-twin-store";

export function seedDigitalTwinDemo() {
  const store = useDigitalTwinStore.getState();
  if (store.mappings.length > 0) return;

  const demoMappings: TwinMapping[] = [
    {
      equipmentId: "motor-01",
      equipmentLabel: "Motor Principal M-01",
      hotspots: [
        {
          id: "hotspot-motor-temp",
          label: "Temp. Enrolamento",
          tag: "MOTOR_01_TEMP",
          type: "temperature",
          unit: "°C",
          position: { x: -1.5, y: 0.8, z: 0 },
          color: "#ef4444",
          alertThreshold: 85,
          criticalThreshold: 105,
          alarmActive: false,
        },
        {
          id: "hotspot-motor-current",
          label: "Corrente do Motor",
          tag: "MOTOR_01_CURRENT",
          type: "current",
          unit: "A",
          position: { x: -1.5, y: 0.4, z: 0 },
          color: "#f59e0b",
          alertThreshold: 18,
          criticalThreshold: 22,
          alarmActive: false,
        },
        {
          id: "hotspot-motor-vib",
          label: "Vibração",
          tag: "MOTOR_01_VIB",
          type: "pressure",
          unit: "mm/s",
          position: { x: -1.5, y: 0, z: 0 },
          color: "#8b5cf6",
          alertThreshold: 7,
          criticalThreshold: 12,
          alarmActive: false,
        },
      ],
    },
    {
      equipmentId: "tank-01",
      equipmentLabel: "Tanque de Nível LT-01",
      hotspots: [
        {
          id: "hotspot-tank-level",
          label: "Nível do Tanque",
          tag: "LT_01_LEVEL",
          type: "level",
          unit: "%",
          position: { x: 1.5, y: 0.5, z: 0 },
          color: "#3b82f6",
          alertThreshold: 80,
          criticalThreshold: 95,
          alarmActive: false,
        },
        {
          id: "hotspot-tank-pressure",
          label: "Pressão de Fundo",
          tag: "LT_01_PRESSURE",
          type: "pressure",
          unit: "bar",
          position: { x: 1.5, y: 0, z: 0 },
          color: "#10b981",
          alertThreshold: 2.5,
          criticalThreshold: 3.5,
          alarmActive: false,
        },
      ],
    },
    {
      equipmentId: "pump-01",
      equipmentLabel: "Bomba Centrífuga P-01",
      hotspots: [
        {
          id: "hotspot-pump-status",
          label: "Status da Bomba",
          tag: "PUMP_01_STATUS",
          type: "status",
          unit: "",
          position: { x: 0, y: 0.8, z: -1.2 },
          color: "#22c55e",
          alarmActive: false,
        },
        {
          id: "hotspot-pump-flow",
          label: "Vazão",
          tag: "PUMP_01_FLOW",
          type: "flow",
          unit: "m³/h",
          position: { x: 0, y: 0.4, z: -1.2 },
          color: "#06b6d4",
          alertThreshold: 40,
          criticalThreshold: 55,
          alarmActive: false,
        },
      ],
    },
  ];

  demoMappings.forEach((m) => store.addMapping(m));

  // Push some initial telemetry
  const now = Date.now();
  const startVal: Record<string, () => number> = {
    MOTOR_01_TEMP: () => 65 + Math.sin(now / 5000) * 8 + Math.random() * 2,
    MOTOR_01_CURRENT: () => 14.2 + Math.sin(now / 3000) * 1.5 + Math.random() * 0.3,
    MOTOR_01_VIB: () => 4.5 + Math.sin(now / 2000) * 1.5 + Math.random() * 0.5,
    LT_01_LEVEL: () => 62 + Math.sin(now / 8000) * 8 + Math.random() * 1,
    LT_01_PRESSURE: () => 1.8 + Math.sin(now / 6000) * 0.3 + Math.random() * 0.05,
    PUMP_01_STATUS: () => (Math.sin(now / 10000) > 0 ? 1 : 0),
    PUMP_01_FLOW: () => 28 + Math.sin(now / 4000) * 5 + Math.random() * 1,
  };

  Object.entries(startVal).forEach(([tag, fn]) => {
    // Push 10 historical samples
    for (let i = 10; i >= 0; i--) {
      const ts = now - i * 3000;
      const value = fn();
      store.pushTelemetry(tag, value);
    }
  });
}
