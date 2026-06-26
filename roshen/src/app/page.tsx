import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Roshen</h1>
        <p className="text-sm text-neutral-500">
          Next.js App Router + Supabase Auth starter.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        {user ? (
          <p>
            Signed in as <span className="font-medium">{user.email}</span>.
          </p>
        ) : (
          <p className="text-neutral-500">You are not signed in.</p>
        )}
      </div>

      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Go to login
        </Link>
        <Link
          href="/account"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Account (protected)
        </Link>
      </div>
    </main>
  );
}
