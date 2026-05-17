import { MousePointer2 } from "lucide-react";
import type { CollabCursor } from "@/hooks/use-collab";

export function MultiplayerCursors({ cursors }: { cursors: CollabCursor[] }) {
  if (cursors.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
      {cursors.map((c) => (
        <div
          key={c.userId}
          className="absolute pointer-events-none transition-all duration-75 ease-out"
          style={{
            left: c.x,
            top: c.y,
          }}
        >
          <MousePointer2
            className="h-4 w-4 fill-current drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
            style={{ color: c.color }}
          />
          <div
            className="absolute left-3.5 top-3.5 px-1.5 py-0.5 rounded text-[8px] font-bold text-white shadow-md whitespace-nowrap select-none font-mono"
            style={{ backgroundColor: c.color }}
          >
            {c.userName}
          </div>
        </div>
      ))}
    </div>
  );
}
