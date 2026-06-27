import { redirect } from "next/navigation";

// Calendar now lives under Workspace.
export default function Page() {
  redirect("/workspace/calendar");
}
