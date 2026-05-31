import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { resolveHomePath } from '@/lib/erp/home';

/** Login lives in a modal on the landing page now — deep-link /login opens it. */
export default async function LoginPage() {
  const ctx = await getUserContext();
  if (ctx) redirect(resolveHomePath(ctx));
  redirect('/?login=1');
}
