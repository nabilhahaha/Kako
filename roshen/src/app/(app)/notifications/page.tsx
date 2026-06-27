import Link from "next/link";
import { Bell } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/tasks";

export default async function NotificationsPage() {
  await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();
  const { data } = await supabase
    .from("notification")
    .select("id,title,message,action_url,is_read,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const items = data ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("notif.title")}</h1>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-burgundy hover:bg-burgundy-soft">{t("notif.mark_all")}</button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <Bell className="mx-auto h-7 w-7 text-muted/50" />
          <p className="mt-2 text-sm font-medium text-ink">{t("notif.none")}</p>
        </Card>
      ) : (
        <Card className="divide-y divide-line/60 p-0">
          {items.map((n) => {
            const body = (
              <div className={"px-4 py-3 " + (n.is_read ? "" : "bg-burgundy-soft/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    {n.message && <p className="mt-0.5 text-sm text-muted">{n.message}</p>}
                    <p className="mt-1 text-[11px] text-muted">{new Date(n.created_at as string).toLocaleString()}</p>
                  </div>
                  {!n.is_read && (
                    <form action={markNotificationRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className="whitespace-nowrap text-xs font-medium text-burgundy hover:underline">{t("notif.mark_read")}</button>
                    </form>
                  )}
                </div>
              </div>
            );
            return n.action_url ? (
              <Link key={n.id} href={n.action_url} className="block hover:bg-cream/40">{body}</Link>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
