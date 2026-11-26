import { connection, type NextRequest } from "next/server";
import { sentPerDay } from "@/lib/db";
import { createWidget, deleteWidget, getWidget, saveWidget } from "@/lib/widget";
import { widgetWithDefaults, type WidgetSettings } from "@/lib/widget-settings";

// Configuration du widget de site web (réservé à l'administrateur).
export async function GET() {
  await connection();
  return Response.json({ widget: getWidget(), volume: sentPerDay("web", 30) });
}

// « Connecter » : crée le widget.
export async function POST(req: NextRequest) {
  if (getWidget()) return Response.json({ error: "Le widget existe déjà." }, { status: 409 });
  const { settings } = (await req.json().catch(() => ({}))) as { settings?: Partial<WidgetSettings> };
  return Response.json({ widget: createWidget(widgetWithDefaults(settings)) });
}

// « Enregistrer les modifications ».
export async function PATCH(req: NextRequest) {
  const widget = getWidget();
  if (!widget) return Response.json({ error: "Aucun widget." }, { status: 404 });
  const { settings } = (await req.json().catch(() => ({}))) as { settings?: Partial<WidgetSettings> };
  saveWidget(widget.id, widgetWithDefaults(settings));
  return Response.json({ widget: getWidget() });
}

// Zone dangereuse : supprime le widget (les discussions du site restent).
export async function DELETE() {
  const widget = getWidget();
  if (widget) deleteWidget(widget.id);
  return Response.json({ ok: true });
}
