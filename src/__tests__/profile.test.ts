import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ProfileUpdateSchema,
  mergePreferences,
  normalizeAvatarUrl,
  organizationRoleLabel,
  readJobTitle,
  readProviderAvatar,
} from "@/lib/profile";

describe("perfil do usuário", () => {
  it("cargo vai para preferences.job_title, preservando outras preferências", () => {
    const prefs = mergePreferences({ ai_provider: "gemini" }, "Engenheiro eletricista");
    expect(prefs).toEqual({ ai_provider: "gemini", job_title: "Engenheiro eletricista" });
    expect(readJobTitle(prefs)).toBe("Engenheiro eletricista");
    expect(mergePreferences(prefs, "")).toEqual({ ai_provider: "gemini" });
    expect(readJobTitle(null)).toBe("");
    expect(readJobTitle(["x"])).toBe("");
  });

  it("avatar aceita só HTTPS sem credenciais", () => {
    expect(normalizeAvatarUrl("https://cdn.exemplo.com/a.png")).toBe(
      "https://cdn.exemplo.com/a.png",
    );
    expect(normalizeAvatarUrl("http://exemplo.com/a.png")).toBeNull();
    expect(normalizeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeAvatarUrl("https://user:pw@exemplo.com/a.png")).toBeNull();
    expect(normalizeAvatarUrl("   ")).toBeNull();
    expect(readProviderAvatar({ picture: "https://lh3.example.com/p" })).toBe(
      "https://lh3.example.com/p",
    );
    expect(readProviderAvatar({ avatar_url: "data:image/png;base64,AAA" })).toBeNull();
  });

  it("validação recusa nome vazio, idioma desconhecido e avatar inseguro", () => {
    const ok = { fullName: "Ana", jobTitle: "", locale: "pt-BR", avatarUrl: "" };
    expect(ProfileUpdateSchema.safeParse(ok).success).toBe(true);
    expect(ProfileUpdateSchema.safeParse({ ...ok, fullName: "  " }).success).toBe(false);
    expect(ProfileUpdateSchema.safeParse({ ...ok, locale: "xx" }).success).toBe(false);
    expect(ProfileUpdateSchema.safeParse({ ...ok, avatarUrl: "http://a.com/x" }).success).toBe(
      false,
    );
    expect(ProfileUpdateSchema.safeParse({ ...ok, fullName: "a".repeat(121) }).success).toBe(false);
  });

  it("papel na empresa é exibido, nunca editado como cargo", () => {
    expect(organizationRoleLabel("owner")).toBe("Proprietário");
    expect(organizationRoleLabel("desconhecido")).toBe("Membro");
    const server = readFileSync("src/lib/profile.functions.ts", "utf8");
    const page = readFileSync("src/routes/settings.profile.tsx", "utf8");
    // Regressão: a tela gravava o cargo em profiles.role (papel de segurança).
    expect(server).not.toMatch(/\brole:\s*data\./);
    expect(page).not.toMatch(/\.from\("profiles"\)/);
    expect(server).toMatch(/updated\.length === 0/);
  });
});
