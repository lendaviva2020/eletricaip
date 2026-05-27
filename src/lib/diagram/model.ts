// Factories puras e helpers Immer para o DiagramDoc.
// Toda mutação do doc passa por aqui (e por comandos).
import { produce, type Draft } from "immer";
import { ulid } from "ulid";
import {
  DIAGRAM_DOC_VERSION,
  DiagramDocSchema,
  type DiagramDoc,
  type DiagramEdge,
  type DiagramNode,
  type NodeParams,
  type Position,
  type SheetKind,
} from "./schema";

export const newId = (prefix: string): string => `${prefix}_${ulid()}`;

export function createEmptyDoc(partial?: Partial<DiagramDoc>): DiagramDoc {
  const now = new Date().toISOString();
  const doc: DiagramDoc = {
    version: DIAGRAM_DOC_VERSION,
    id: partial?.id ?? newId("doc"),
    metadata: {
      title: partial?.metadata?.title ?? "Novo projeto",
      norms: partial?.metadata?.norms ?? ["NBR 5410"],
      createdAt: now,
      updatedAt: now,
      ...partial?.metadata,
    },
    sheets: partial?.sheets ?? ["unifilar"],
    nodes: partial?.nodes ?? {},
    edges: partial?.edges ?? {},
  };
  return DiagramDocSchema.parse(doc);
}

export function makeNode(input: {
  sheet: SheetKind;
  params: NodeParams;
  position: Position;
  label?: string;
  id?: string;
  rotation?: number;
}): DiagramNode {
  return {
    id: input.id ?? newId("n"),
    sheet: input.sheet,
    position: input.position,
    rotation: input.rotation ?? 0,
    label: input.label ?? "",
    params: input.params,
  };
}

export function makeEdge(input: Omit<DiagramEdge, "id"> & { id?: string }): DiagramEdge {
  return { id: input.id ?? newId("e"), ...input };
}

// Atalhos com Immer — usados pelos comandos.
export const applyDraft = (doc: DiagramDoc, fn: (d: Draft<DiagramDoc>) => void): DiagramDoc =>
  produce(doc, (d) => {
    fn(d);
    d.metadata.updatedAt = new Date().toISOString();
  });

export function serializeDoc(doc: DiagramDoc): string {
  return JSON.stringify(DiagramDocSchema.parse(doc));
}

export function deserializeDoc(raw: unknown): DiagramDoc {
  return DiagramDocSchema.parse(raw);
}
