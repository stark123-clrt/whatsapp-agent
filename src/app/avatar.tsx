"use client";

import { useState } from "react";
import { ChannelDot } from "@/lib/channels";
import type { Channel } from "@/lib/db";

const SIZES = { md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" };

/** Photo de profil WhatsApp si le contact en a une, sinon ses initiales. */
export function Avatar({
  jid,
  name,
  phone,
  channel,
  size = "md",
}: {
  jid: string;
  name: string | null;
  phone: string | null;
  channel: Channel;
  size?: keyof typeof SIZES;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    ? name
        .split(/\s+/)
        .filter((w) => /\p{L}|\p{N}/u.test(w))
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("")
    : (phone?.slice(-2) ?? "?");

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-medium text-zinc-700 ${SIZES[size]}`}
    >
      {failed ? (
        initials
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- photo servie par l'API (cache local)
        <img
          src={`/api/avatar/${encodeURIComponent(jid)}`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full object-cover"
        />
      )}
      <span className="absolute -right-0.5 -bottom-0.5">
        <ChannelDot channel={channel} size={size === "lg" ? 22 : 16} />
      </span>
    </span>
  );
}
