import "server-only";

import { createClient } from "@/lib/supabase/server";

export type HeaderData = {
  liveStream: { href: string; name: string } | null;
};

export async function getHeaderData(): Promise<HeaderData> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streaming_channels")
    .select("public_id,access_key,name")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { liveStream: null };

  return {
    liveStream: {
      href: `/stream/${data.public_id}/${data.access_key}`,
      name: data.name,
    },
  };
}
