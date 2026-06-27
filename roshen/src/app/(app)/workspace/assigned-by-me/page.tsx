import { TaskListScreen } from "@/components/app/workspace/task-list-screen";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string }> }) {
  return <TaskListScreen scope="assigned" basePath="/workspace/assigned-by-me" titleKey="nav.assigned" subtitleKey="ws.assigned_sub" searchParams={searchParams} />;
}
