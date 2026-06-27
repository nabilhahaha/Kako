import { RequestListScreen } from "@/components/app/requests/request-list-screen";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string; requester?: string; approver?: string }> }) {
  return <RequestListScreen kind="business_trip" basePath="/requests/business-trip" titleKey="nav.business_trip" subtitleKey="req.bt_sub" searchParams={searchParams} />;
}
