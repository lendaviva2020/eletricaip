import { createFileRoute } from "@tanstack/react-router";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { Plug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings/integrations")({
  head: () => ({ meta: [{ title: "Integrações · EletricAI" }] }),
  component: IntegrationsPage,
});

interface ProtoConfig {
  modbus: { host: string; port: number; unitId: number };
  opcua: { endpoint: string; username: string };
  mqtt: { broker: string; clientId: string; username: string };
}

interface IntegrationsState extends ProtoConfig {
  set: <K extends keyof ProtoConfig>(k: K, v: ProtoConfig[K]) => void;
}

export const useIntegrations = create<IntegrationsState>()(
  persist(
    (set) => ({
      modbus: { host: "192.168.1.100", port: 502, unitId: 1 },
      opcua: { endpoint: "opc.tcp://localhost:4840", username: "" },
      mqtt: { broker: "mqtt://broker.local:1883", clientId: "eletricai-1", username: "" },
      set: (k, v) => set((s) => ({ ...s, [k]: v })),
    }),
    { name: "eletricai-integrations" },
  ),
);

function IntegrationsPage() {
  const s = useIntegrations();

  const save = () => toast.success("Configurações de integração salvas localmente");

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" /> Integrações
        </h1>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold">Modbus TCP/RTU</h2>
            <div className="grid grid-cols-3 gap-3">
              <FieldT label="Host">
                <Input
                  value={s.modbus.host}
                  onChange={(e) => s.set("modbus", { ...s.modbus, host: e.target.value })}
                />
              </FieldT>
              <FieldT label="Porta">
                <Input
                  type="number"
                  value={s.modbus.port}
                  onChange={(e) => s.set("modbus", { ...s.modbus, port: Number(e.target.value) })}
                />
              </FieldT>
              <FieldT label="Unit ID">
                <Input
                  type="number"
                  value={s.modbus.unitId}
                  onChange={(e) => s.set("modbus", { ...s.modbus, unitId: Number(e.target.value) })}
                />
              </FieldT>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold">OPC-UA</h2>
            <div className="grid grid-cols-2 gap-3">
              <FieldT label="Endpoint">
                <Input
                  value={s.opcua.endpoint}
                  onChange={(e) => s.set("opcua", { ...s.opcua, endpoint: e.target.value })}
                />
              </FieldT>
              <FieldT label="Usuário">
                <Input
                  value={s.opcua.username}
                  onChange={(e) => s.set("opcua", { ...s.opcua, username: e.target.value })}
                />
              </FieldT>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold">MQTT</h2>
            <div className="grid grid-cols-3 gap-3">
              <FieldT label="Broker">
                <Input
                  value={s.mqtt.broker}
                  onChange={(e) => s.set("mqtt", { ...s.mqtt, broker: e.target.value })}
                />
              </FieldT>
              <FieldT label="Client ID">
                <Input
                  value={s.mqtt.clientId}
                  onChange={(e) => s.set("mqtt", { ...s.mqtt, clientId: e.target.value })}
                />
              </FieldT>
              <FieldT label="Usuário">
                <Input
                  value={s.mqtt.username}
                  onChange={(e) => s.set("mqtt", { ...s.mqtt, username: e.target.value })}
                />
              </FieldT>
            </div>
          </CardContent>
        </Card>

        <Button onClick={save}>Salvar configurações</Button>
      </div>
    </div>
  );
}

function FieldT({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
