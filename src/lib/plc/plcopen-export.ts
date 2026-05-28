// PLCopen XML (TC6) skeleton exporter — #PLC-03
// Generates a minimal but well-formed .plcproj XML representing the current
// PlcProject: variables (global VAR), POUs (one per program block, language
// inferred), and a hardware comment block. Designed to be re-importable by
// CODESYS/B&R/Beremiz as a starting point; not a 100% conformant build.

import type { PlcProject, PlcProgramBlock, PlcVariable } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const langTag = (lang: PlcProgramBlock["language"]) =>
  lang === "ladder" ? "LD" : lang === "fbd" ? "FBD" : "ST";

const varBlock = (vars: PlcVariable[]) => {
  if (vars.length === 0) return "      <variables/>";
  const items = vars
    .map(
      (v) => `        <variable name="${esc(v.name || v.id)}">
          <type><${v.type}/></type>${
            v.initialValue !== undefined && v.initialValue !== null
              ? `\n          <initialValue><simpleValue value="${esc(String(v.initialValue))}"/></initialValue>`
              : ""
          }
          <documentation><xhtml xmlns="http://www.w3.org/1999/xhtml">${esc(v.comment)} · addr=${esc(v.address)}${v.retentive ? " · RETAIN" : ""}</xhtml></documentation>
        </variable>`,
    )
    .join("\n");
  return `      <variables>\n${items}\n      </variables>`;
};

const pouBlock = (b: PlcProgramBlock) => {
  const lang = langTag(b.language);
  const body =
    lang === "ST"
      ? `<ST><xhtml xmlns="http://www.w3.org/1999/xhtml">${esc(b.code || "// (empty)")}</xhtml></ST>`
      : `<${lang}/><!-- graphical body persisted in companion JSON -->`;
  return `    <pou name="${esc(b.name)}" pouType="${b.type === "OB" || b.type === "FC" ? "function" : "functionBlock"}">
      <interface>
        <localVars/>
      </interface>
      <body>
        ${body}
      </body>
      <documentation><xhtml xmlns="http://www.w3.org/1999/xhtml">${esc(b.comment)} · #${b.number}</xhtml></documentation>
    </pou>`;
};

export function buildPlcOpenXml(project: PlcProject): string {
  const now = new Date().toISOString();
  const modules = project.rack.modules
    .map(
      (m, i) =>
        `      <!-- Slot ${i + 1}: ${esc(m.label)} (${esc(m.category)}) ${m.channels > 0 ? `${m.channels}ch` : ""} -->`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0201" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <fileHeader companyName="EletricAI" productName="EletricAI Studio" productVersion="1.0" creationDateTime="${now}"/>
  <contentHeader name="${esc(project.rack.label)}" modificationDateTime="${now}">
    <coordinateInfo>
      <fbd><scaling x="1" y="1"/></fbd>
      <ld><scaling x="1" y="1"/></ld>
      <sfc><scaling x="1" y="1"/></sfc>
    </coordinateInfo>
  </contentHeader>
  <types>
    <dataTypes/>
    <pous>
${project.programBlocks.map(pouBlock).join("\n")}
    </pous>
  </types>
  <instances>
    <configurations>
      <configuration name="${esc(project.vendor)}_config">
        <resource name="MainResource">
          <task name="MainTask" priority="0" interval="T#${project.cycleTimeMs}ms">
${project.programBlocks
  .filter((b) => b.type === "OB")
  .map((b) => `            <pouInstance name="${esc(b.name)}_inst" typeName="${esc(b.name)}"/>`)
  .join("\n")}
          </task>
${varBlock(project.variables)}
${modules ? `          <!-- Hardware rack:\n${modules}\n          -->` : ""}
        </resource>
      </configuration>
    </configurations>
  </instances>
</project>
`;
}

export function downloadPlcOpenXml(project: PlcProject): void {
  const xml = buildPlcOpenXml(project);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(project.rack.label || "project").replace(/\s+/g, "_")}.plcproj`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
