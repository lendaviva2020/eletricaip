import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  SquaresFour,
  FolderOpen,
  Cpu,
  Users,
  Cube,
  Sparkle,
  ChatText,
  Pulse,
  Gear,
  Plus,
  Sun,
  Moon,
  BookOpen,
} from "@phosphor-icons/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/lib/design-system/theme";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onCustomOpen = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("eletricai-open-command-palette", onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("eletricai-open-command-palette", onCustomOpen);
    };
  }, []);

  const runCommand = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Ir para rota ou executar comando..." />
      <CommandList>
        <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>

        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/dashboard" }))}>
            <SquaresFour className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Dashboard</span>
            <CommandShortcut>/dashboard</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/projects" }))}>
            <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Projetos</span>
            <CommandShortcut>/projects</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/workspace" }))}>
            <Cpu className="mr-2 h-4 w-4 text-primary" />
            <span>Industrial Workspace</span>
            <CommandShortcut>/workspace</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/clients" }))}>
            <Users className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Clientes</span>
            <CommandShortcut>/clients</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/catalog" }))}>
            <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Catálogo Técnico</span>
            <CommandShortcut>/catalog</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/ai" }))}>
            <Sparkle className="mr-2 h-4 w-4 text-primary" />
            <span>IA Industrial</span>
            <CommandShortcut>/ai</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/chat" }))}>
            <ChatText className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Copiloto Técnico (Chat)</span>
            <CommandShortcut>/chat</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/digital-twin" }))}>
            <Cube className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Digital Twin</span>
            <CommandShortcut>/digital-twin</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/realtime" }))}>
            <Pulse className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Telemetria em Tempo Real</span>
            <CommandShortcut>/realtime</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/settings" }))}>
            <Gear className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Configurações</span>
            <CommandShortcut>/settings</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações Rápidas">
          <CommandItem onSelect={() => runCommand(() => router.navigate({ to: "/onboarding" }))}>
            <Plus className="mr-2 h-4 w-4 text-primary" />
            <span>Novo projeto</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2 h-4 w-4 text-warning" />
            ) : (
              <Moon className="mr-2 h-4 w-4 text-primary" />
            )}
            <span>Alternar para tema {resolvedTheme === "dark" ? "claro" : "escuro"}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
