import { redirect } from "next/navigation";

export const metadata = { title: "Channels" };

export default async function ChannelsPage() {
  redirect("/operations#channels");
}
