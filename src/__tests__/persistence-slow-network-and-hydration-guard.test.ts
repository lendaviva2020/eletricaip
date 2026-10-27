// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadProject = vi.fn();
const mockSaveProject = vi.fn();

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: () => (args: any) => {
      if (args?.data?.projectId && !args?.data?.snapshot) {
        return mockLoadProject(args);
      }
      return mockSaveProject(args);
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import { renderHook, act, waitFor } from "@testing-library/react";
import { useProjectPersistence } from "@/lib/use-project-persistence";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useAutosaveLog } from "@/lib/autosave-log";

describe("Prioridade 3 — Proteção de Hidratação contra Rede Lenta e Falhas de Conexão", () => {
  const projectId = "00000000-0000-4000-a000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    useAutosaveLog.getState().clear();
    useProjectStore.getState().markSaved();
    useEditorStore.getState().markSaved();
    useDiagramStore.getState().resetDoc();
  });

  it("1. Rede Lenta: bloqueia autosave e impede sobrescrita com estado vazio durante a carga lenta", async () => {
    let resolveServer!: (val: any) => void;
    const slowServerPromise = new Promise((resolve) => {
      resolveServer = resolve;
    });

    const mockSnapshot = {
      project: { nodes: [{ id: "NODE_S1", type: "supply" }], edges: [], tags: {} },
      diagram: { nodes: { NODE_S1: { id: "NODE_S1", type: "supply" } }, edges: {} },
      editor: {
        tags: {},
        rungs: [{ id: "rung_slow_net_1", label: "Rede 1", cols: 8, cells: [[{ kind: "NO", operand: "%I0.0" }]] }],
        fbdNodes: [],
        fbdEdges: [],
      },
    };

    mockLoadProject.mockImplementation(() => slowServerPromise);
    mockSaveProject.mockResolvedValue({ version: 4 });

    const { result } = renderHook(() => useProjectPersistence(projectId));

    // Enquanto está carregando:
    expect(result.current.loading).toBe(true);

    // Tentativa de mutação concorrente enquanto a carga está em voo
    act(() => {
      useEditorStore.getState().setRungs((r) => [...r]);
    });

    // Confirma que saveProject NÃO foi chamado durante o carregamento
    expect(mockSaveProject).not.toHaveBeenCalled();

    // Conclui a resposta lenta do servidor
    act(() => {
      resolveServer({
        project: { id: projectId, name: "Projeto Remoto" },
        snapshot: mockSnapshot,
        version: 3,
      });
    });

    // Aguarda o término do carregamento
    await waitFor(() => expect(result.current.loading).toBe(false));

    // O estado do projeto remoto foi aplicado com fidelidade
    expect(useEditorStore.getState().rungs[0].id).toBe("rung_slow_net_1");

    // Confirma que saveProject NÃO sobrescreveu com dados vazios
    expect(mockSaveProject).not.toHaveBeenCalled();
  });

  it("2. Falha de Conexão: não dispara autosave e não destrói o estado local em memória", async () => {
    // Configura rungs locais prévios
    useEditorStore.getState().setRungs([
      { id: "rung_local_pre", label: "Rede Preexistente", cols: 8, cells: [[{ kind: "OTE", operand: "%Q0.0" }]] }
    ]);
    useEditorStore.getState().markSaved();

    mockLoadProject.mockRejectedValue(new Error("NetworkError: Failed to fetch"));
    mockSaveProject.mockResolvedValue({ version: 2 });

    const { result } = renderHook(() => useProjectPersistence(projectId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Os logs de autosave registraram a falha de carga
    const events = useAutosaveLog.getState().events;
    const errorLog = events.find((l) => l.kind === "load:error");
    expect(errorLog).toBeDefined();
    expect(errorLog?.message).toContain("Failed to fetch");

    // O estado local NÃO foi deletado nem sobrescrito com array vazio
    expect(useEditorStore.getState().rungs.length).toBe(1);
    expect(useEditorStore.getState().rungs[0].id).toBe("rung_local_pre");

    // Nenhum autosave fantasma foi agendado ou disparado
    expect(mockSaveProject).not.toHaveBeenCalled();
  });

  it("3. Recuperação e Autosave Legítimo: após recuperação de rede e hidratação bem-sucedida, edição legítima salva", async () => {
    const mockSnapshot = {
      project: { nodes: [], edges: [], tags: {} },
      editor: {
        tags: {},
        rungs: [{ id: "rung_recovered_1", label: "Rede Recuperada", cols: 8, cells: [] }],
        fbdNodes: [],
        fbdEdges: [],
      },
    };

    mockLoadProject.mockResolvedValue({
      project: { id: projectId, name: "Recuperado" },
      snapshot: mockSnapshot,
      version: 5,
    });
    mockSaveProject.mockResolvedValue({ version: 6 });

    const { result } = renderHook(() => useProjectPersistence(projectId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(useEditorStore.getState().rungs[0].id).toBe("rung_recovered_1");
    expect(mockSaveProject).not.toHaveBeenCalled();

    // Agora o usuário realiza uma edição legítima
    act(() => {
      useEditorStore.getState().setRungs((r) => [
        ...r,
        { id: "rung_user_added", label: "Rede Nova Usuário", cols: 8, cells: [] }
      ]);
    });

    // O autosave tem debounce de 2000ms. Aguardamos ele disparar
    await waitFor(
      () => {
        expect(mockSaveProject).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              projectId,
              expectedVersion: 5,
            }),
          })
        );
      },
      { timeout: 3500 }
    );
  });
});
