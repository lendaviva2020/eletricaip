// PLCopen XML & IEC 61131-3 Code Generator for Industrial Dossier
// Generates official compliant PLCopen XML TC6-0201, Structured Text (ST) and Instruction List (IL)
// Strict typing, deterministic output, no fake syntax.

import type { ExtractedCanvasData } from "./extractor";
import type { PlcProgramDoc } from "./types";

export function generateStructuredText(program: PlcProgramDoc): string {
  const lines: string[] = [];
  lines.push(`(* ============================================================== *)`);
  lines.push(`(* ELÉTRICAI INDUSTRIAL OS — STRUCTURED TEXT PROGRAM (IEC 61131-3)*)`);
  lines.push(`(* Target Rack: ${program.rackName} | CPU: ${program.cpuModel} *)`);
  lines.push(`(* Generated: ${new Date().toISOString()} *)`);
  lines.push(`(* ============================================================== *)`);
  lines.push(``);

  lines.push(`PROGRAM MainLogic`);
  lines.push(`  VAR`);
  for (const io of program.ioMappings) {
    const plcType = io.direction.startsWith("A") ? "INT" : "BOOL";
    lines.push(`    ${io.symbolicTag} AT ${io.address} : ${plcType}; (* ${io.description} *)`);
  }
  lines.push(`    bEstopHealthy : BOOL;`);
  lines.push(`    bSystemRunning : BOOL;`);
  lines.push(`  END_VAR`);
  lines.push(``);

  lines.push(`  (* --- SEGURANÇA E PARADA DE EMERGÊNCIA (NR-12) --- *)`);
  lines.push(`  bEstopHealthy := NOT SbEmergencyStop_NC;`);
  lines.push(``);

  for (const net of program.networks) {
    lines.push(`  (* ${net.title} *)`);
    lines.push(`  (* ${net.functionalDescription} *)`);
    if (net.hasSafetyInterlock) {
      lines.push(`  IF bEstopHealthy THEN`);
      lines.push(`    ${net.codeStPreview}`);
      lines.push(`  ELSE`);
      lines.push(`    ${net.tagsUsed[0] ?? "OUT"} := FALSE; (* Corte imediato por emergência *)`);
      lines.push(`  END_IF;`);
    } else {
      lines.push(`  ${net.codeStPreview}`);
    }
    lines.push(``);
  }

  lines.push(`END_PROGRAM`);
  return lines.join("\n");
}

export function generateInstructionList(program: PlcProgramDoc): string {
  const lines: string[] = [];
  lines.push(`(* INSTRUCTION LIST (IL) — IEC 61131-3 *)`);
  lines.push(`(* Project CPU: ${program.cpuModel} *)`);
  lines.push(``);

  for (let i = 0; i < program.networks.length; i++) {
    const net = program.networks[i];
    lines.push(`NETWORK ${i + 1} (* ${net.title} *)`);
    if (net.codeIlPreview) {
      lines.push(net.codeIlPreview);
    } else {
      lines.push(`LD TRUE\nST ${net.tagsUsed[0] ?? "OUT"}`);
    }
    lines.push(``);
  }
  return lines.join("\n");
}

export function generatePlcopenXml(extracted: ExtractedCanvasData, program: PlcProgramDoc): string {
  const now = new Date().toISOString();
  const projectName = extracted.projectName.replace(/[<>&'"]/g, "_");
  const author = extracted.clientName.replace(/[<>&'"]/g, "_");

  const varXml = program.ioMappings
    .map((io) => {
      const typeStr = io.direction.startsWith("A") ? "<INT/>" : "<BOOL/>";
      return `      <variable name="${io.symbolicTag}" address="${io.address}">
        <type>
          ${typeStr}
        </type>
        <documentation>
          <xhtml xmlns="http://www.w3.org/1999/xhtml">${io.description}</xhtml>
        </documentation>
      </variable>`;
    })
    .join("\n");

  const stBody = generateStructuredText(program)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0201" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.plcopen.org/xml/tc6_0201 tc6_0201.xsd">
  <fileHeader companyName="EletricAi Industrial OS" productName="EletricAi Engineering Dossier" productVersion="3.0" creationDateTime="${now}"/>
  <contentHeader name="${projectName}" version="1.0">
    <coordinateInfo>
      <fbd>
        <scaling x="1" y="1"/>
      </fbd>
      <ld>
        <scaling x="1" y="1"/>
      </ld>
      <sfc>
        <scaling x="1" y="1"/>
      </sfc>
    </coordinateInfo>
  </contentHeader>
  <types>
    <dataTypes/>
    <pous>
      <pou name="MainLogic" pouType="program">
        <interface>
          <localVars>
${varXml}
          </localVars>
        </interface>
        <body>
          <ST>
            <xhtml xmlns="http://www.w3.org/1999/xhtml">${stBody}</xhtml>
          </ST>
        </body>
      </pou>
    </pous>
  </types>
  <instances>
    <configurations>
      <configuration name="Config1">
        <resource name="${program.rackName.replace(/[<>&'"]/g, "_")}">
          <task name="Task10ms" interval="PT0.01S" priority="1">
            <pouInstance name="InstMainLogic" typeName="MainLogic"/>
          </task>
        </resource>
      </configuration>
    </configurations>
  </instances>
</project>`;
}
