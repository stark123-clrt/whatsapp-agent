import type { Metadata } from "next";
import { DealsClient } from "./deals-client";

export const metadata: Metadata = { title: "Opportunités" };

export default function OpportunitesPage() {
  return <DealsClient />;
}
