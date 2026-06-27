import { RequestListScreen } from "@/components/app/requests/request-list-screen";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; requester?: string; approver?: string }> }) {
  return <RequestListScreen kind="approvals" basePath="/requests/approvals" titleKey="nav.approvals" subtitleKey="req.approvals_sub" searchParams={searchParams} />;
}
