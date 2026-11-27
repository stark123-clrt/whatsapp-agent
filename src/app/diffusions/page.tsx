import type { Metadata } from "next";
import { BroadcastsClient } from "./broadcasts-client";

export const metadata: Metadata = { title: "Diffusions" };

export default function DiffusionsPage() {
  return <BroadcastsClient />;
}
