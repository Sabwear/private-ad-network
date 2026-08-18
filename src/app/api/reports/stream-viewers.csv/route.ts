import { NextResponse } from "next/server";
import { z } from "zod";
import { getStreamMonitorData } from "@/lib/repositories/stream-monitor";

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

  const monitor = await getStreamMonitorData(168);
  if (monitor.source !== "live") {
    return NextResponse.json({ error: monitor.message ?? "Platform administrator report access is required" }, { status: 403 });
  }

  const viewers = monitor.viewers.filter((viewer) => {
    if (parsed.data.mode !== "all" && viewer.mode !== parsed.data.mode) return false;
    if (parsed.data.activity === "live" && !viewer.active) return false;
    if (parsed.data.activity === "ended" && viewer.active) return false;
    return parsed.data.channel === "" || viewer.channelId === parsed.data.channel;
  });

  const headings = ["Viewer", "Email", "Identity mode", "Status", "Channel", "Session started", "Last active", "Verified seconds", "Earned credits", "Consumed credits", "Rejected events"];
  const rows = viewers.map((viewer) => [
    viewer.name, viewer.email ?? "", viewer.mode, viewer.active ? "live" : "ended", viewer.channel,
    viewer.startedAt, viewer.lastActivityAt, viewer.verifiedSeconds,
    viewer.creditsEarned, viewer.creditsSpent, viewer.rejectedEvents,
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
