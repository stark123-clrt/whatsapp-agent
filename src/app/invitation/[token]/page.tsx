import type { Metadata } from "next";
import { Suspense } from "react";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Invitation" };

export default function InvitationPage({ params }: PageProps<"/invitation/[token]">) {
  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}

async function Invite({ params }: { params: PageProps<"/invitation/[token]">["params"] }) {
  const { token } = await params;
  return <InviteForm token={token} />;
}
