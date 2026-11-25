import { redirect } from "next/navigation";

// Ancienne adresse : les canaux sont maintenant dans Paramètres → Canaux.
export default function CanauxPage() {
  redirect("/parametres?section=channels");
}
