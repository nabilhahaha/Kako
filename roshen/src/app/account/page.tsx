import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signout } from "@/app/login/actions";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-neutral-500">
          This page is only reachable when authenticated.
        </p>
      </div>

      <dl className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div className="mt-2 flex justify-between gap-4">
          <dt className="text-neutral-500">User ID</dt>
          <dd className="font-mono text-xs">{user.id}</dd>
        </div>
      </dl>

      <form action={signout}>
        <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
          Sign out
        </button>
      </form>
    </main>
  );
}
