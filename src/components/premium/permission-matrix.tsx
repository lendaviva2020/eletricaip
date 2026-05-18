import { useState } from "react";

interface PermissionRow {
  label: string;
  key: string;
  view: boolean;
  edit: boolean;
  execute: boolean;
  admin: boolean;
}

export function PermissionMatrix({
  rows: initialRows,
  onUpdate,
  className = "",
}: {
  rows: PermissionRow[];
  onUpdate?: (rows: PermissionRow[]) => void;
  className?: string;
}) {
  const [rows, setRows] = useState(initialRows);

  const cols = [
    { key: "view" as const, label: "Visualizar" },
    { key: "edit" as const, label: "Editar" },
    { key: "execute" as const, label: "Executar" },
    { key: "admin" as const, label: "Administrar" },
  ];

  function toggle(rowIdx: number, colKey: keyof PermissionRow) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: !r[colKey] } : r));
    setRows(next);
    onUpdate?.(next);
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-border/50 ${className}`}>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border/40 bg-muted/30">
            <th className="text-left font-medium text-muted-foreground/60 px-3 py-2.5 uppercase tracking-[0.1em]">
              Permissão
            </th>
            {cols.map((c) => (
              <th
                key={c.key}
                className="text-center font-medium text-muted-foreground/60 px-3 py-2.5 uppercase tracking-[0.1em]"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {rows.map((row, ri) => (
            <tr key={row.key} className="hover:bg-muted/10 transition-colors">
              <td className="px-3 py-2.5 font-medium text-foreground/80">{row.label}</td>
              {cols.map((col) => {
                const val = row[col.key];
                return (
                  <td key={col.key} className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => toggle(ri, col.key)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus:outline-none ${
                        val ? "border-primary/50 bg-primary/20" : "border-border/40 bg-muted/30"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 translate-y-0 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                          val ? "translate-x-[18px] bg-primary" : "translate-x-[2px]"
                        }`}
                      />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
