import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessStreamProfile } from "@/lib/repositories/business-profile";

const filterSchema = z.object({
  mode: z.enum(["all", "anonymous", "registered"]).default("all"),
  activity: z.enum(["all", "live", "ended"]).default("all"),
  channel: z.union([z.literal(""), z.coerce.number().int().positive()]).default(""),
});

function csvCell(value: string | number) {
  const normalized = String(value).replaceAll('"', '""');
  return `"${normalized}"`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = filterSchema.safeParse({
    mode: url.searchParams.get("mode") ?? "all",
    activity: url.searchParams.get("activity") ?? "all",
    channel: url.searchParams.get("channel") ?? "",
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid report filters" }, { status: 400 });

  const profile = await getBusinessStreamProfile({
    mode: parsed.data.mode,
    activity: parsed.data.activity,
    channelId: parsed.data.channel === "" ? null : parsed.data.channel,
  }, 5000);
  if (!profile) return NextResponse.json({ error: "Business report access is required" }, { status: 403 });

  const headings = ["Viewer", "Email", "Identity mode", "Status", "Channel", "Session started", "Last active", "Verified seconds", "Earned credits", "Consumed credits", "Rejected events"];
  const rows = profile.viewers.map((viewer) => [
    viewer.name, viewer.email, viewer.mode, viewer.status, viewer.channel,
    viewer.createdAt, viewer.lastActivityAt, viewer.verifiedSeconds,
    viewer.earnedCredits, viewer.consumedCredits, viewer.rejectedEvents,
  ]);
  const csv = [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stream-viewers-${date}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
