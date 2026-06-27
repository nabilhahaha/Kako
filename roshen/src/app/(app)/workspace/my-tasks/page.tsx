import { TaskListScreen } from "@/components/app/workspace/task-list-screen";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string }> }) {
  return <TaskListScreen scope="my" basePath="/workspace/my-tasks" titleKey="nav.my_tasks" subtitleKey="ws.my_sub" searchParams={searchParams} />;
}
