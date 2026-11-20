// WebVisu local do ElétricAi Runtime: IHM servida pelo próprio gateway na rede
// interna (navegador do painel, tablet do operador). Node.js `http`/`https`.
//
// Segurança: PIN local obrigatório (comparação em tempo constante, bloqueio
// após tentativas), sessão em cookie HttpOnly SameSite=Strict, cabeçalho
// anti-CSRF + conferência de Origin em toda escrita, corpo ≤ 4 KB validado por
// Zod, CSP com nonce e nenhum dado inserido como HTML. O arme pede o PIN de
// novo; parar não pede nada.
import http from "node:http";
import https from "node:https";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { RuntimeDaemon } from "./runtime-daemon";
import { buildHmiLayout, type HmiLayout } from "@/lib/hmi/hmi-layout";
import {
  equipmentStatesFromTags,
  parseSymbolStateKey,
  symbolStateKey,
} from "@/lib/hmi/hmi-tag-state";
import { renderHmiSymbolSvg } from "./hmi-symbol-svg";

export interface WebVisuOptions {
  host: string;
  port: number;
  pin: string;
  tls?: { cert: string | Buffer; key: string | Buffer };
  /** Tempo de sessão (padrão 8 h, um turno). */
  sessionMs?: number;
}

export const MIN_PIN_LENGTH = 6;
const MAX_BODY = 4096;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 5 * 60_000;

const PinBody = z.object({ pin: z.string().min(1).max(64) });
const TagBody = z.object({
  tag: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.]{0,47}$/),
  value: z.union([z.boolean(), z.number().finite()]),
});

function digest(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

export function createWebVisuServer(daemon: RuntimeDaemon, opts: WebVisuOptions) {
  if (opts.pin.length < MIN_PIN_LENGTH) {
    throw new Error(`PIN local precisa de pelo menos ${MIN_PIN_LENGTH} caracteres`);
  }
  const pinHash = digest(opts.pin);
  const sessionMs = opts.sessionMs ?? 8 * 3600_000;
  const sessions = new Map<string, number>();
  const fails: number[] = [];
  const secure = !!opts.tls;

  const pinOk = (pin: string) => timingSafeEqual(digest(pin), pinHash);
  const locked = () => {
    const now = Date.now();
    while (fails.length && now - fails[0] > FAIL_WINDOW_MS) fails.shift();
    return fails.length >= MAX_FAILS;
  };

  function sessionOf(req: http.IncomingMessage): string | null {
    const m = /(?:^|;\s*)ev_session=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie ?? "");
    if (!m) return null;
    const exp = sessions.get(m[1]);
    if (!exp || exp < Date.now()) {
      sessions.delete(m[1]);
      return null;
    }
    return m[1];
  }

  function send(
    res: http.ServerResponse,
    status: number,
    body: unknown,
    extra: Record<string, string> = {},
  ) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    });
    res.end(JSON.stringify(body));
  }

  function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error("corpo grande demais"));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
        } catch {
          reject(new Error("JSON inválido"));
        }
      });
      req.on("error", reject);
    });
  }

  /** Escrita só do próprio WebVisu: cabeçalho próprio + Origin igual ao Host. */
  function sameOrigin(req: http.IncomingMessage): boolean {
    if (req.headers["x-eletricai-webvisu"] !== "1") return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  /** Geometria da tela (uma vez por pacote) + estado de cada equipamento pelas tags. */
  let layoutCache: { hash: string | null; layout: HmiLayout | null } = { hash: "", layout: null };
  function hmiView(hash: string | null, tags: Record<string, boolean | number>) {
    const doc = daemon.package?.hmi ?? null;
    if (!doc || doc.equipment.length === 0) return null;
    if (layoutCache.hash !== hash) layoutCache = { hash, layout: buildHmiLayout(doc) };
    const states = equipmentStatesFromTags(doc, tags);
    return {
      layout: layoutCache.layout,
      states: Object.fromEntries(
        Object.entries(states).map(([id, s]) => [
          id,
          { key: symbolStateKey(s.state), hasSignal: s.hasSignal, bound: s.bound, state: s.state },
        ]),
      ),
    };
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://local");
    if (req.method === "GET" && url.pathname === "/") {
      const nonce = randomBytes(16).toString("base64");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      });
      res.end(webVisuHtml(nonce));
      return;
    }
    if (!url.pathname.startsWith("/api/")) return send(res, 404, { error: "não encontrado" });
    if (req.method === "POST" && !sameOrigin(req))
      return send(res, 403, { error: "origem recusada" });

    if (req.method === "POST" && url.pathname === "/api/login") {
      if (locked()) return send(res, 429, { error: "muitas tentativas; aguarde 5 minutos" });
      const b = PinBody.safeParse(await readBody(req));
      if (!b.success || !pinOk(b.data.pin)) {
        fails.push(Date.now());
        daemon.event("LOGIN_FAILED", `PIN incorreto de ${req.socket.remoteAddress ?? "?"}`);
        return send(res, 401, { error: "PIN incorreto" });
      }
      const token = randomBytes(24).toString("base64url");
      sessions.set(token, Date.now() + sessionMs);
      return send(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": `ev_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionMs / 1000)}${secure ? "; Secure" : ""}`,
        },
      );
    }

    const session = sessionOf(req);
    if (!session) return send(res, 401, { error: "entre com o PIN" });

    if (req.method === "GET" && url.pathname === "/api/state") {
      const status = daemon.status();
      return send(res, 200, {
        status,
        hmi: hmiView(status.packageHash, status.tags),
        events: daemon.recentEvents().slice(0, 30),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/hmi/symbol") {
      // Símbolo desenhado pelo MESMO componente do editor HMI; vai como imagem.
      const type = url.searchParams.get("type") ?? "";
      const key = url.searchParams.get("s") ?? "";
      const state = /^[a-z0-9_]{1,40}$/.test(type) ? parseSymbolStateKey(key) : null;
      const svg = state ? renderHmiSymbolSvg(type, state, key) : null;
      if (!svg) return send(res, 404, { error: "símbolo inválido" });
      res.writeHead(200, {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      });
      res.end(svg);
      return;
    }
    if (req.method !== "POST") return send(res, 405, { error: "método não permitido" });
    let body: unknown;
    try {
      body = await readBody(req);
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : "corpo inválido" });
    }
    switch (url.pathname) {
      case "/api/logout":
        sessions.delete(session);
        return send(res, 200, { ok: true }, { "Set-Cookie": "ev_session=; Max-Age=0; Path=/" });
      case "/api/disarm":
        daemon.disarm("parada pelo operador no WebVisu");
        return send(res, 200, { ok: true });
      case "/api/arm": {
        if (locked()) return send(res, 429, { error: "muitas tentativas; aguarde 5 minutos" });
        const b = PinBody.safeParse(body);
        if (!b.success || !pinOk(b.data.pin)) {
          fails.push(Date.now());
          return send(res, 401, { error: "PIN incorreto" });
        }
        const r = daemon.arm();
        return r.ok
          ? send(res, 200, { ok: true })
          : send(res, 409, { error: "não armado", blockers: r.blockers });
      }
      case "/api/command": {
        const b = TagBody.safeParse(body);
        if (!b.success) return send(res, 400, { error: "comando inválido" });
        return daemon.command(b.data.tag, b.data.value)
          ? send(res, 200, { ok: true })
          : send(res, 409, { error: "só tags de memória (não mapeadas no campo) aceitam comando" });
      }
      case "/api/sim-input": {
        const b = TagBody.safeParse(body);
        if (!b.success) return send(res, 400, { error: "valor inválido" });
        return daemon.setSimulatedInput(b.data.tag, b.data.value)
          ? send(res, 200, { ok: true })
          : send(res, 409, { error: "só entradas de conexão simulada" });
      }
      default:
        return send(res, 404, { error: "não encontrado" });
    }
  }

  const listener = (req: http.IncomingMessage, res: http.ServerResponse) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: "erro interno" });
    });
  };
  const server = opts.tls
    ? https.createServer({ cert: opts.tls.cert, key: opts.tls.key }, listener)
    : http.createServer(listener);
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;

  return {
    server,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(opts.port, opts.host, () => {
          const a = server.address();
          resolve(typeof a === "object" && a ? a.port : opts.port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Página autônoma (sem dependências externas). Texto sempre via textContent. */
export function webVisuHtml(nonce: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ElétricAi Runtime — WebVisu</title>
<style nonce="${nonce}">
:root{--bg:#0d1117;--card:#161b22;--fg:#e6edf3;--mut:#8b949e;--line:#30363d;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--pri:#f0b429}
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
main{padding:16px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:0 0 8px}
.mode{font:600 13px ui-monospace,monospace;padding:4px 10px;border-radius:6px;border:1px solid}
.SHADOW{color:var(--warn);border-color:var(--warn)}.RUN{color:var(--ok);border-color:var(--ok)}.SAFE{color:var(--bad);border-color:var(--bad)}
table{width:100%;border-collapse:collapse;font:12px ui-monospace,monospace}td{padding:4px 6px;border-bottom:1px solid var(--line)}
.on{color:var(--ok)}.off{color:var(--mut)}button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid var(--line);background:#21262d;color:var(--fg);cursor:pointer}
button.pri{background:var(--pri);color:#111;border-color:var(--pri)}button.bad{background:var(--bad);color:#fff;border-color:var(--bad)}
input{font:inherit;padding:6px 8px;border-radius:6px;border:1px solid var(--line);background:#0d1117;color:var(--fg)}
ul{margin:0;padding-left:18px}.mut{color:var(--mut)}.banner{background:#3b2e0a;color:#f0d58a;padding:8px 16px;font-size:12px}
svg{width:100%;height:auto;background:#0d1117;border-radius:6px}
.pad{padding:24px}.narrow{max-width:360px}.mt{margin-top:12px}.full{grid-column:1/-1}
.small{font-size:12px;margin:0 0 8px}.hmiwrap{overflow:auto;max-height:70vh}#hmi{min-width:640px;cursor:default}
.eq{cursor:pointer}.eq:hover .box{stroke:#58a6ff}.face{margin-top:12px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body>
<div class="banner">Um botão de software não substitui o circuito físico de emergência (NR-10 / NR-12). O arme é local e exige o PIN.</div>
<header><strong>ElétricAi Runtime</strong><span id="mode" class="mode SHADOW">—</span>
<span id="pkg" class="mut"></span><span><button id="arm" class="pri">Armar (escrever no campo)</button> <button id="stop" class="bad">PARAR</button> <button id="out">Sair</button></span></header>
<div id="login" hidden class="pad"><section class="narrow"><h2>Entrar</h2><form id="lf"><input id="pin" type="password" autocomplete="off" placeholder="PIN local" maxlength="64"> <button class="pri">Entrar</button></form><p id="lerr" class="mut"></p></section></div>
<main id="app" hidden>
<section><h2>Por que não está escrevendo</h2><ul id="blockers"></ul><h2 class="mt">Falhas</h2><ul id="faults"></ul></section>
<section><h2>Comunicação</h2><table id="conns"></table></section>
<section class="full"><h2 id="hmititle">Tela de processo</h2><p class="mut small">Equipamentos mostram só o que as tags dizem; sem tag = "sem sinal". Toque num equipamento para ver as tags.</p><div class="hmiwrap"><svg id="hmi" viewBox="0 0 1000 400"></svg></div><div id="face" hidden class="face"><h2 id="facet"></h2><table id="facetags"></table><button id="faceclose">Fechar</button></div></section>
<section><h2>Entradas</h2><table id="ins"></table></section>
<section><h2>Saídas (campo)</h2><table id="outs"></table></section>
<section><h2>Memória / comandos</h2><table id="mem"></table></section>
<section><h2>Eventos</h2><ul id="ev"></ul></section>
</main>
<script nonce="${nonce}">
const H={"Content-Type":"application/json","x-eletricai-webvisu":"1"};
const $=id=>document.getElementById(id);
function el(t,txt,cls){const e=document.createElement(t);if(txt!=null)e.textContent=String(txt);if(cls)e.className=cls;return e}
async function post(p,b){const r=await fetch(p,{method:"POST",headers:H,body:JSON.stringify(b||{}),credentials:"same-origin"});let j={};try{j=await r.json()}catch(e){}return{ok:r.ok,status:r.status,j}}
function fmt(v){return typeof v==="boolean"?(v?"1":"0"):(Math.round(v*1000)/1000)}
function rows(tbl,list,tags,editable){tbl.replaceChildren();for(const t of list){const tr=el("tr");tr.append(el("td",t));const v=tags[t];const td=el("td",v===undefined?"—":fmt(v),v===true?"on":"off");tr.append(td);if(editable){const c=el("td");const b=el("button",typeof v==="number"?"definir":"alternar");b.onclick=async()=>{let nv;if(typeof v==="number"){const s=prompt(t+" =",String(v));if(s===null)return;nv=Number(s);if(!isFinite(nv))return}else nv=!v;const r=await post("/api/command",{tag:t,value:nv});if(!r.ok)alert(r.j.error||"recusado");refresh()};c.append(b);tr.append(c)}tbl.append(tr)}}
const NS="http://www.w3.org/2000/svg";let hmiKey="";const eqEls={};let lastHmi=null;let lastTags={};
function sv(t,a){const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,String(a[k]));return e}
function drawHmi(h,tags){lastHmi=h;lastTags=tags;const s=$("hmi");if(!h||!h.layout){if(hmiKey!=="none"){s.replaceChildren();const t=sv("text",{x:20,y:40,fill:"#8b949e"});t.textContent="Sem tela de processo no pacote.";s.append(t);hmiKey="none"}return}
const L=h.layout;const key=JSON.stringify([L.bounds,L.equipment.length,L.links.length,L.title]);
if(key!==hmiKey){hmiKey=key;s.replaceChildren();for(const k in eqEls)delete eqEls[k];$("hmititle").textContent=L.title;const b=L.bounds,pad=60;s.setAttribute("viewBox",[b.minX-pad,b.minY-pad,(b.maxX-b.minX)+2*pad,(b.maxY-b.minY)+2*pad+40].join(" "));
for(const l of L.links){const d="M"+l.points.map(p=>p[0]+" "+p[1]).join(" L");s.append(sv("path",{d:d,fill:"none",stroke:l.color,"stroke-width":l.electric?2:6,"stroke-opacity":0.75,"stroke-dasharray":l.electric?"5 4":"none","stroke-linejoin":"round"}))}
for(const e of L.equipment){const g=sv("g",{class:"eq"});g.append(sv("rect",{class:"box",x:e.x-4,y:e.y-4,width:e.w+8,height:e.h+8,rx:6,fill:"none",stroke:"transparent","stroke-width":2}));
const img=sv("image",{width:e.symbolW,height:e.symbolH,transform:"translate("+(e.x+(e.w-e.symbolW)/2)+" "+(e.y+(e.h-e.symbolH)/2)+") rotate("+e.rotation+" "+(e.symbolW/2)+" "+(e.symbolH/2)+")"});g.append(img);
const t1=sv("text",{x:e.x+e.w/2,y:e.y+e.h+16,fill:"#e6edf3","text-anchor":"middle","font-size":12,"font-family":"ui-monospace,monospace","font-weight":700,stroke:"#0d1117","stroke-width":4,"paint-order":"stroke"});t1.textContent=e.id+(e.label?" · "+e.label:"");g.append(t1);
const t2=sv("text",{x:e.x+e.w/2,y:e.y+e.h+31,fill:"#8b949e","text-anchor":"middle","font-size":11,"font-family":"ui-monospace,monospace",stroke:"#0d1117","stroke-width":4,"paint-order":"stroke"});g.append(t2);g.addEventListener("click",()=>openFace(e.id));s.append(g);eqEls[e.id]={img:img,status:t2,g:g,eq:e,key:""}}}
for(const id in eqEls){const it=eqEls[id];const st=h.states[id];if(!st)continue;if(st.key!==it.key){it.key=st.key;it.img.setAttribute("href","/api/hmi/symbol?type="+encodeURIComponent(it.eq.type)+"&s="+encodeURIComponent(st.key))}
it.g.setAttribute("opacity",st.hasSignal?"1":"0.5");const x=st.state;let txt;if(!st.hasSignal)txt="sem sinal ("+(it.eq.tag||it.eq.id)+")";else{const p=[];if(st.bound.running)p.push(x.running?(x.reverse?"REVERSO":"LIGADO"):"PARADO");if(st.bound.speedPct)p.push(Math.round(x.speedPct)+"%");if(st.bound.open)p.push(x.open?"ABERTA":"FECHADA");if(st.bound.levelPct)p.push("nível "+Math.round(x.levelPct)+"%");txt=p.join(" · ")}
it.status.textContent=txt;it.status.setAttribute("fill",!st.hasSignal?"#8b949e":x.running?(x.reverse?"#d29922":"#3fb950"):"#8b949e")}
if(!$("face").hidden&&faceId)fillFace()}
let faceId=null;function openFace(id){faceId=id;$("face").hidden=false;fillFace()}
function fillFace(){const it=eqEls[faceId];if(!it||!lastHmi)return;const e=it.eq;const base=e.tag||e.id;$("facet").textContent=e.id+(e.label?" — "+e.label:"")+" ("+e.type+")";
const names=Object.keys(lastTags).filter(t=>t===base||t.indexOf(base+".")===0||t.indexOf(base+"_")===0).sort();const mapped=new Set(lastStatus?[...lastStatus.inputs,...lastStatus.outputs]:[]);
const tb=$("facetags");tb.replaceChildren();if(!names.length){const tr=el("tr");tr.append(el("td","Nenhuma tag começa com "+base+" na imagem de processo.","mut"));tb.append(tr);return}
for(const t of names){const v=lastTags[t];const tr=el("tr");tr.append(el("td",t),el("td",fmt(v),v===true?"on":"off"),el("td",mapped.has(t)?"campo":"memória","mut"));const c=el("td");if(!mapped.has(t)){const b=el("button",typeof v==="number"?"definir":"alternar");b.onclick=async()=>{let nv;if(typeof v==="number"){const q=prompt(t+" =",String(v));if(q===null)return;nv=Number(q);if(!isFinite(nv))return}else nv=!v;const r=await post("/api/command",{tag:t,value:nv});if(!r.ok)alert(r.j.error||"recusado");refresh()};c.append(b)}tr.append(c);tb.append(tr)}}
let lastStatus=null;
async function refresh(){const r=await fetch("/api/state",{credentials:"same-origin"});if(r.status===401){$("app").hidden=true;$("login").hidden=false;return}$("login").hidden=true;$("app").hidden=false;const d=await r.json();const st=d.status;lastStatus=st;
$("mode").textContent={SHADOW:"SOMBRA — não escreve no campo",RUN:"EM OPERAÇÃO — escrevendo",SAFE:"SEGURO — saídas no valor seguro"}[st.mode];$("mode").className="mode "+st.mode;
$("pkg").textContent=(st.projectName||"sem programa")+(st.packageHash?" · "+st.packageHash.slice(0,12):"")+(st.approved?" · aprovado":" · NÃO aprovado")+" · ciclo "+st.lastScanMs+" ms";
const bl=$("blockers");bl.replaceChildren();for(const b of st.blockers)bl.append(el("li",b));if(!st.blockers.length)bl.append(el("li","nada — escrevendo no campo","on"));
const fl=$("faults");fl.replaceChildren();for(const f of st.faults)fl.append(el("li",f));if(!st.faults.length)fl.append(el("li","nenhuma","mut"));
const ct=$("conns");ct.replaceChildren();for(const c of st.connections){const tr=el("tr");tr.append(el("td",c.id+" ("+c.kind+")"),el("td",c.ok?"ok":"falha",c.ok?"on":""),el("td",c.lastError||""));ct.append(tr)}
const mapped=new Set([...st.inputs,...st.outputs]);rows($("ins"),st.inputs,st.tags,false);rows($("outs"),st.outputs,st.tags,false);rows($("mem"),Object.keys(st.tags).filter(t=>!mapped.has(t)).sort(),st.tags,true);
drawHmi(d.hmi,st.tags);const ev=$("ev");ev.replaceChildren();for(const e of d.events)ev.append(el("li",e.at.slice(11,19)+" "+e.kind+" — "+e.message))}
$("lf").onsubmit=async ev=>{ev.preventDefault();const r=await post("/api/login",{pin:$("pin").value});$("pin").value="";$("lerr").textContent=r.ok?"":(r.j.error||"erro");refresh()};
$("arm").onclick=async()=>{if(!confirm("Armar habilita a ESCRITA nas saídas reais do campo. Confirme que a área está liberada."))return;const pin=prompt("Digite o PIN local para armar");if(!pin)return;const r=await post("/api/arm",{pin});if(!r.ok)alert((r.j.error||"recusado")+(r.j.blockers?"\\n- "+r.j.blockers.join("\\n- "):""));refresh()};
$("stop").onclick=async()=>{await post("/api/disarm");refresh()};$("faceclose").onclick=()=>{$("face").hidden=true;faceId=null};$("out").onclick=async()=>{await post("/api/logout");refresh()};
refresh();setInterval(refresh,1000);
</script></body></html>`;
}
