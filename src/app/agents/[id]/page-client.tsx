"use client";

import { useParams } from "next/navigation";
import { AgentEditor } from "./editor";

export function AgentPageClient() {
  const { id } = useParams<{ id: string }>();
  return <AgentEditor key={id} id={Number(id)} />;
}
