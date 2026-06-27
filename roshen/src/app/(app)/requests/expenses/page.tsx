import { RequestListScreen } from "@/components/app/requests/request-list-screen";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; requester?: string; approver?: string }> }) {
  return <RequestListScreen kind="expense" basePath="/requests/expenses" titleKey="nav.expenses" subtitleKey="req.expenses_sub" searchParams={searchParams} />;
}
