import { Cpu, FileCode, Variable } from "lucide-react";
import { SidebarSearch, SidebarShell } from "./sidebar-primitives";

const TREE: { icon: typeof Cpu; title: string; children: string[] }[] = [
  { icon: Cpu, title: "Hardware", children: ["CPU", "DI 16x", "DO 16x", "AI 8x"] },
  { icon: Variable, title: "Tags", children: ["%I0.0 START", "%I0.1 STOP", "%Q0.0 K1_CMD"] },
  { icon: FileCode, title: "Programas", children: ["MAIN (Ladder)", "SUB_MOTOR (FBD)"] },
];

export function EditorPlcSidebar() {
  return (
    <SidebarShell width={240}>
      <SidebarSearch title="Projeto PLC" placeholder="Buscar..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {TREE.map((node) => {
          const Icon = node.icon;
          return (
            <div key={node.title}>
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <Icon className="h-3 w-3" /> {node.title}
              </div>
              <div className="grid gap-0.5 pl-4">
                {node.children.map((c) => (
                  <button
                    key={c}
                    className="text-left px-2 py-1 rounded text-[11px] hover:bg-accent text-foreground/85"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SidebarShell>
  );
}
