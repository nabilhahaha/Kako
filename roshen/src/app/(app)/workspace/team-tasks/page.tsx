import { TaskListScreen } from "@/components/app/workspace/task-list-screen";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string }> }) {
  return <TaskListScreen scope="team" basePath="/workspace/team-tasks" titleKey="nav.team_tasks" subtitleKey="ws.team_sub" searchParams={searchParams} />;
}
