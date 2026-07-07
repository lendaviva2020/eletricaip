// #WGL-07 · etapa 3 — collab realtime reescrito sobre o DiagramStore canônico.
// Broadcast/receive de `Command`s (undo/redo inclusos) em canal versionado
// `diagram:v2:${projectId}`. Sem mais dependência de useVoltaiStore/useProjectStore
// para sincronizar geometria do desenho.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDiagramStore } from "@/lib/diagram/store";
import type { Command } from "@/lib/diagram/commands";
import { toast } from "sonner";

export interface CollabUser {
  userId: string;
  userName: string;
  color: string;
  status: "active" | "away";
}

export interface CollabCursor {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
}

const USER_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#f97316",
  "#14b8a6",
];

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

interface CommandPayload {
  command: Command;
  senderId: string;
  seq: number;
}

export function useCollab(projectId: string | null) {
  const { user } = useAuth();
  const [users, setUsers] = useState<CollabUser[]>([]);
  const [cursors, setCursors] = useState<CollabCursor[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myColor = useRef<string>("#3b82f6");
  const seqRef = useRef(0);

  const userId = user?.id ?? "anonymous";
  const userName = user?.email?.split("@")[0] ?? "Engenheiro";

  useEffect(() => {
    myColor.current = stringToColor(userId);
  }, [userId]);

  useEffect(() => {
    if (!projectId) return;

    const channelName = `diagram:v2:${projectId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<
          string,
          Array<{ userName?: string; color?: string; status?: "active" | "away" }>
        >;
        const active: CollabUser[] = [];
        for (const key of Object.keys(state)) {
          const presence = state[key]?.[0];
          if (presence) {
            active.push({
              userId: key,
              userName: presence.userName || "Colaborador",
              color: presence.color || "#3b82f6",
              status: presence.status || "active",
            });
          }
        }
        setUsers(active);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        const p = (newPresences as Array<{ userName?: string }>)?.[0];
        if (p && key !== userId) {
          toast.success(`${p.userName || "Um colaborador"} entrou no workspace.`);
        }
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        const p = (leftPresences as Array<{ userName?: string }>)?.[0];
        if (p && key !== userId) {
          toast.info(`${p.userName || "Um colaborador"} saiu.`);
          setCursors((prev) => prev.filter((c) => c.userId !== key));
        }
      })
      .on("broadcast", { event: "cursor" }, (payload) => {
        const data = payload.payload as CollabCursor;
        if (data.userId === userId) return;
        setCursors((prev) => [...prev.filter((c) => c.userId !== data.userId), data]);
      })
      .on("broadcast", { event: "diagram-command" }, (payload) => {
        const data = payload.payload as CommandPayload;
        if (!data?.command || data.senderId === userId) return;
        useDiagramStore.getState().applyRemoteCommand(data.command);
      });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          userId,
          userName,
          color: myColor.current,
          status: "active",
        });
      }
    });

    // Broadcast comandos locais observando o histórico do DiagramStore.
    // dispatch → past cresce; undo → past encolhe, future cresce (aplica inverse);
    // redo → future encolhe, past cresce (reaplica command).
    const unsubHistory = useDiagramStore.subscribe(
      (s) => s.history,
      (next, prev) => {
        if (!channelRef.current) return;
        let outgoing: Command | null = null;

        if (next.past.length > prev.past.length && next.future.length === 0) {
          // dispatch novo
          outgoing = next.past[next.past.length - 1]?.command ?? null;
        } else if (
          next.past.length < prev.past.length &&
          next.future.length > prev.future.length
        ) {
          // undo → aplica o inverso do entry que saiu de past
          const entry = prev.past[prev.past.length - 1];
          outgoing = entry?.inverse ?? null;
        } else if (
          next.future.length < prev.future.length &&
          next.past.length > prev.past.length
        ) {
          // redo → reaplica o command do entry que saiu de future
          const entry = prev.future[prev.future.length - 1];
          outgoing = entry?.command ?? null;
        }

        if (!outgoing) return;
        seqRef.current += 1;
        channelRef.current.send({
          type: "broadcast",
          event: "diagram-command",
          payload: {
            command: outgoing,
            senderId: userId,
            seq: seqRef.current,
          } satisfies CommandPayload,
        });
      },
    );

    return () => {
      unsubHistory();
      try {
        channel.untrack();
      } catch {
        // ignore
      }
      supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [projectId, userId, userName]);

  const broadcastCursor = (x: number, y: number) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "cursor",
      payload: { userId, userName, color: myColor.current, x, y },
    });
  };

  return { users, cursors, broadcastCursor, myColor: myColor.current };
}
