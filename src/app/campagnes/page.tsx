import type { Metadata } from "next";
import { CampaignsClient } from "./campaigns-client";

export const metadata: Metadata = { title: "Campagnes" };

export default function CampagnesPage() {
  return <CampaignsClient />;
}
