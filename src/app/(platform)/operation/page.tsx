import { redirect } from "next/navigation";

export default function LegacyOperationPage() {
  redirect("/operations#channels");
}
