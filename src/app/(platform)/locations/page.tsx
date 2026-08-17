import { redirect } from "next/navigation";

export const metadata = { title: "Locations" };

export default async function LocationsPage() {
  redirect("/campaigns#locations");
}
