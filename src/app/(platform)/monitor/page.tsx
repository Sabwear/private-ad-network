import { redirect } from "next/navigation";

export const metadata = { title: "Stream monitor" };

export default async function StreamMonitorPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams;
  redirect(`/operations${params.range ? `?range=${encodeURIComponent(params.range)}` : ""}#monitor`);
}
