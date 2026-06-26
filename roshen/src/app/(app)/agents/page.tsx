import { redirect } from "next/navigation";

// Distributors now live under Organization (Region → City → Distributor).
export default function Page() {
  redirect("/organization?tab=distributors");
}
