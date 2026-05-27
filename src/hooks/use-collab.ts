import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProjectStore } from "@/lib/project-store";
import { useVoltaiStore } from "@/lib/voltai/store";
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
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#f97316", // orange
  "#14b8a6", // teal
];

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
}

export function useCollab(projectId: string | null) {
  const { user } = useAuth();
  const [users, setUsers] = useState<CollabUser[]>([]);
  const [cursors, setCursors] = useState<CollabCursor[]>([]);
  const channelRef = useRef<any>(null);
  const myColor = useRef<string>("#3b82f6");

  const userId = user?.id ?? "anonymous";
  const userName = user?.email?.split("@")[0] ?? "Engenheiro";

  useEffect(() => {
    myColor.current = stringToColor(userId);
  }, [userId]);

  // Function to broadcast custom events (e.g. Node Drag / State Edit)
  const broadcastStateChange = (project?: any, voltai?: any) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "canvas-change",
      payload: {
        project,
        voltai,
        senderId: userId,
      },
    });
  };

  // Handle Realtime Subscription
  useEffect(() => {
    if (!projectId) return;

    const channelName = `project-collab-${projectId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channelRef.current = channel;

    // Presence events
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const activeUsers: CollabUser[] = [];
        Object.keys(state).forEach((key) => {
          const presence = state[key]?.[0] as any;
          if (presence) {
            activeUsers.push({
              userId: key,
              userName: presence.userName || "Colaborador",
              color: presence.color || "#3b82f6",
              status: presence.status || "active",
            });
          }
        });
        setUsers(activeUsers);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        const presence = newPresences?.[0] as any;
        if (presence && key !== userId) {
          toast.success(`${presence.userName || "Um colaborador"} entrou no workspace.`);
        }
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        const presence = leftPresences?.[0] as any;
        if (presence && key !== userId) {
          toast.info(`${presence.userName || "Um colaborador"} saiu.`);
          setCursors((prev) => prev.filter((c) => c.userId !== key));
        }
      });

    // Broadcast messages (Cursors & state updates)
    channel
      .on("broadcast", { event: "cursor" }, (payload: any) => {
        const data = payload.payload as CollabCursor;
        if (data.userId === userId) return;
        setCursors((prev) => {
          const filtered = prev.filter((c) => c.userId !== data.userId);
          return [...filtered, data];
        });
      })
      .on("broadcast", { event: "canvas-change" }, (payload: any) => {
        const data = payload.payload;
        if (data.senderId === userId) return;

        // Silently update both stores!
        if (data.project) {
          useProjectStore.getState().setAll(data.project.nodes ?? [], data.project.edges ?? []);
        }
        if (data.voltai) {
          useVoltaiStore.getState().setAll(data.voltai.components ?? [], data.voltai.edges ?? []);
        }
      });

    // Subscribe and track
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

    // Automatically auto-broadcast updates when stores become dirty
    const unsubProject = useProjectStore.subscribe((state, prev) => {
      if (state.dirty && state.dirty !== prev.dirty) {
        broadcastStateChange(
          { nodes: state.nodes, edges: state.edges },
          {
            components: useVoltaiStore.getState().components,
            edges: useVoltaiStore.getState().edges,
          },
        );
      }
    });

    const unsubVoltai = useVoltaiStore.subscribe((state, prev) => {
      if (state.dirty && state.dirty !== prev.dirty) {
        broadcastStateChange(
          { nodes: useProjectStore.getState().nodes, edges: useProjectStore.getState().edges },
          { components: state.components, edges: state.edges },
        );
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      unsubProject();
      unsubVoltai();
    };
  }, [projectId, userId, userName]);

  // Function to broadcast own cursor position
  const broadcastCursor = (x: number, y: number) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "cursor",
      payload: {
        userId,
        userName,
        color: myColor.current,
        x,
        y,
      },
    });
  };

  return {
    users,
    cursors,
    broadcastCursor,
    myColor: myColor.current,
  };
}
