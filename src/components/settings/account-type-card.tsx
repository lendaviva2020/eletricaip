/** Perfil da conta (empresa × autônomo) — lido e gravado na organização real. */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Buildings, User } from "@phosphor-icons/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { applyAccountType, getAccountType } from "@/lib/account-type.functions";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_HINT,
  ACCOUNT_TYPE_LABEL,
  type AccountType,
} from "@/lib/account-type";

export function AccountTypeCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAccountType);
  const applyFn = useServerFn(applyAccountType);
  const [companyName, setCompanyName] = useState("");
  const q = useQuery({ queryKey: ["account-type"], queryFn: () => getFn({}) });
  const m = useMutation({
    mutationFn: (accountType: AccountType) =>
      applyFn({
        data: {
          accountType,
          companyName:
            accountType === "empresa" && companyName.trim().length >= 2 ? companyName.trim() : null,
          mode: "change",
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account-type"] }),
  });

  const current = q.data?.accountType ?? null;

  return (
    <Card data-testid="account-type-card">
      <CardHeader>
        <CardTitle className="text-sm">Perfil da conta</CardTitle>
        <CardDescription className="text-xs">
          {q.data?.organizationName ? `Organização: ${q.data.organizationName}. ` : ""}
          {current ? `Atual: ${ACCOUNT_TYPE_LABEL[current]}.` : "Ainda não definido."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isError && (
          <p role="alert" className="text-xs text-destructive">
            {(q.error as Error).message}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCOUNT_TYPES.map((type) => {
            const Icon = type === "empresa" ? Buildings : User;
            return (
              <div
                key={type}
                className={`rounded-md border p-3 text-xs ${current === type ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <p className="font-medium flex items-center gap-1.5">
                  <Icon className="h-4 w-4" /> {ACCOUNT_TYPE_LABEL[type]}
                </p>
                <p className="text-muted-foreground mt-1">{ACCOUNT_TYPE_HINT[type]}</p>
                {type === "empresa" && current !== "empresa" && q.data?.canEdit && (
                  <input
                    aria-label="Nome da empresa"
                    placeholder="Nome da empresa (opcional)"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    maxLength={120}
                    className="mt-2 h-8 w-full rounded border border-border bg-background px-2"
                  />
                )}
                {current !== type && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7"
                    disabled={!q.data?.canEdit || m.isPending}
                    onClick={() => m.mutate(type)}
                  >
                    Usar este perfil
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {q.data && !q.data.canEdit && (
          <p className="text-xs text-muted-foreground">
            Somente o owner da organização altera o perfil.
          </p>
        )}
        {m.isError && (
          <p role="alert" className="text-xs text-destructive">
            {(m.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
