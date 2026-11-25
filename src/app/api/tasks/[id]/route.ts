import type { NextRequest } from "next/server";
import { deleteTask, updateTask } from "@/lib/db";

// Coche / décoche une tâche.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const id = Number((await ctx.params).id);
  const { done } = (await req.json().catch(() => ({}))) as { done?: boolean };
  if (!Number.isInteger(id) || typeof done !== "boolean") return Response.json({ error: "Requête invalide" }, { status: 400 });
  updateTask(id, done);
  return Response.json({ ok: true });
}

// Supprime une tâche.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Requête invalide" }, { status: 400 });
  deleteTask(id);
  return Response.json({ ok: true });
}
