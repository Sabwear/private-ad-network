import { redirect } from "next/navigation";

export const metadata = { title: "Proof of play" };

export default function ProofPage() {
  redirect("/monitor#proof");
}
