/** Types des opportunités, partagés par le serveur et l'interface. */

export type StageKind = "open" | "won" | "lost";
export type DealPriority = "none" | "low" | "medium" | "high";

export type Pipeline = { id: number; name: string; isMain: boolean; syncTags: boolean };

export type Stage = {
  id: number;
  pipelineId: number;
  name: string;
  color: string;
  kind: StageKind;
  position: number;
  triggerTags: string[];
  defaultValue: number;
  idleDays: number;
  idleTarget: number | null;
};

export type Deal = {
  id: number;
  stageId: number;
  title: string;
  company: string | null;
  value: number; // en euros, nombre entier
  priority: DealPriority;
  jid: string | null; // contact lié
  owner: string | null;
  probability: number; // 0 → 100
  closeDate: string | null; // AAAA-MM-JJ
  source: string | null;
  tags: string[];
  description: string | null;
  notes: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
  stageChangedAt: number;
  wonAt: number | null;
  lostAt: number | null;
};
