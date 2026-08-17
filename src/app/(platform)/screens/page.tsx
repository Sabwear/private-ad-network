import { redirect } from "next/navigation";

export const metadata = { title: "Screens" };

export default async function ScreensPage() {
  redirect("/business#screens");
}
