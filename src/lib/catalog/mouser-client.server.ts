/**
 * Cliente HTTP da Mouser — SOMENTE servidor (`.server.ts`).
 *
 * Segurança:
 *  - host fixo (`api.mouser.com`) e caminhos fixos: nenhuma URL vem do
 *    usuário, então não há SSRF;
 *  - chave em `MOUSER_API_KEY` (variável de ambiente do servidor), nunca no
 *    bundle do navegador nem em logs;
 *  - timeout de 12 s e limite de 2 MB na resposta;
 *  - resposta validada por Zod (`normalizeMouserResponse`).
 */
import {
  MOUSER_HOST,
  MOUSER_KEYWORD_PATH,
  MOUSER_MAX_PARTS_PER_QUERY,
  MOUSER_PARTNUMBER_PATH,
  SupplierError,
  buildKeywordRequest,
  buildPartNumberRequest,
  normalizeMouserResponse,
  type SupplierPart,
  type SupplierSearchResult,
} from "./mouser";

const TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export function isMouserConfigured(): boolean {
  return Boolean(process.env.MOUSER_API_KEY?.trim());
}

async function postMouser(path: string, body: unknown): Promise<SupplierSearchResult> {
  const key = process.env.MOUSER_API_KEY?.trim();
  if (!key) {
    throw new SupplierError(
      "Busca em distribuidor não configurada (MOUSER_API_KEY ausente no servidor).",
      "NOT_CONFIGURED",
    );
  }
  const url = new URL(`https://${MOUSER_HOST}${path}`);
  url.searchParams.set("apiKey", key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new SupplierError(
      aborted
        ? "Distribuidor não respondeu a tempo."
        : "Falha de rede ao consultar o distribuidor.",
      "UPSTREAM",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429)
    throw new SupplierError("Limite de consultas do distribuidor atingido.", "RATE_LIMITED");
  if (!res.ok) throw new SupplierError(`Distribuidor respondeu HTTP ${res.status}.`, "UPSTREAM");

  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES)
    throw new SupplierError("Resposta do distribuidor grande demais.", "BAD_RESPONSE");
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES)
    throw new SupplierError("Resposta do distribuidor grande demais.", "BAD_RESPONSE");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SupplierError("Resposta do distribuidor não é JSON.", "BAD_RESPONSE");
  }
  return normalizeMouserResponse(json);
}

export function searchMouserByKeyword(
  keyword: string,
  records = 20,
): Promise<SupplierSearchResult> {
  return postMouser(MOUSER_KEYWORD_PATH, buildKeywordRequest(keyword, records));
}

/** Consulta códigos Mouser em lotes de 10; devolve mapa código → peça. */
export async function fetchMouserParts(
  supplierPartNumbers: readonly string[],
): Promise<Map<string, SupplierPart>> {
  const unique = [...new Set(supplierPartNumbers.map((p) => p.trim()).filter(Boolean))];
  const out = new Map<string, SupplierPart>();
  for (let i = 0; i < unique.length; i += MOUSER_MAX_PARTS_PER_QUERY) {
    const chunk = unique.slice(i, i + MOUSER_MAX_PARTS_PER_QUERY);
    const result = await postMouser(MOUSER_PARTNUMBER_PATH, buildPartNumberRequest(chunk));
    for (const p of result.parts) out.set(p.supplierPartNumber.toUpperCase(), p);
  }
  return out;
}
