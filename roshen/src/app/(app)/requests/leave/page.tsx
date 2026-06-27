import { RequestListScreen } from "@/components/app/requests/request-list-screen";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; requester?: string; approver?: string; leave_type?: string }> }) {
  return <RequestListScreen kind="leave" basePath="/requests/leave" titleKey="nav.leave" subtitleKey="req.leave_sub" searchParams={searchParams} />;
}
