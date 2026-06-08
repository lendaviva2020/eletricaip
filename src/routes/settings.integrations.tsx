import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useTenantSetting } from "@/hooks/use-tenant-setting";

export const Route = createFileRoute("/settings/integrations")({
  head: () => ({ meta: [{ title: "Integrações · EletricAI" }] }),
  component: IntegrationsPage,
});

interface ProtoConfig {
  modbus: { host: string; port: number; unitId: number };
  opcua: { endpoint: string; username: string };
  mqtt: { broker: string; clientId: string; username: string };
}

const DEFAULTS: ProtoConfig = {
  modbus: { host: "192.168.1.100", port: 502, unitId: 1 },
  opcua: { endpoint: "opc.tcp://localhost:4840", username: "" },
  mqtt: { broker: "mqtt://broker.local:1883", clientId: "eletricai-1", username: "" },
};

function IntegrationsPage() {
  const { value, update, isSaving } = useTenantSetting<ProtoConfig>("integrations", DEFAULTS);

  const save = () => toast.success("Configurações salvas no workspace");

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
                  value={value.modbus.host}
                  onChange={(e) =>
                    update({ modbus: { ...value.modbus, host: e.target.value } })
                  }
                />
              </FieldT>
              <FieldT label="Porta">
                <Input
                  type="number"
                  value={value.modbus.port}
                  onChange={(e) =>
                    update({ modbus: { ...value.modbus, port: Number(e.target.value) } })
                  }
                />
              </FieldT>
              <FieldT label="Unit ID">
                <Input
                  type="number"
                  value={value.modbus.unitId}
                  onChange={(e) =>
                    update({ modbus: { ...value.modbus, unitId: Number(e.target.value) } })
                  }
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
                  value={value.opcua.endpoint}
                  onChange={(e) =>
                    update({ opcua: { ...value.opcua, endpoint: e.target.value } })
                  }
                />
              </FieldT>
              <FieldT label="Usuário">
                <Input
                  value={value.opcua.username}
                  onChange={(e) =>
                    update({ opcua: { ...value.opcua, username: e.target.value } })
                  }
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
                  value={value.mqtt.broker}
                  onChange={(e) =>
                    update({ mqtt: { ...value.mqtt, broker: e.target.value } })
                  }
                />
              </FieldT>
              <FieldT label="Client ID">
                <Input
                  value={value.mqtt.clientId}
                  onChange={(e) =>
                    update({ mqtt: { ...value.mqtt, clientId: e.target.value } })
                  }
                />
              </FieldT>
              <FieldT label="Usuário">
                <Input
                  value={value.mqtt.username}
                  onChange={(e) =>
                    update({ mqtt: { ...value.mqtt, username: e.target.value } })
                  }
                />
              </FieldT>
            </div>
          </CardContent>
        </Card>

        <Button onClick={save} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar configurações"}
        </Button>
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
