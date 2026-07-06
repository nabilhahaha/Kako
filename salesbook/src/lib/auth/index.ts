// Authentication-provider abstraction. The prototype uses a demo provider that
// accepts any credentials; production can swap in OTP (SMS), OAuth, or Supabase
// Auth by implementing `AuthProvider` and selecting it via AUTH_PROVIDER.
import type { L } from '../types';

export type Role = 'super_admin' | 'company_admin' | 'regional_manager' | 'area_manager' | 'supervisor' | 'rep';

export interface AuthUser {
  id: string;
  name: L;
  phone: string;
  role: Role;
  company?: string;
  status: 'active' | 'pending' | 'rejected';
}

export interface SignInInput { phone: string; password?: string; otp?: string }
export interface RegisterInput {
  name: string; phone: string; company: string; job: string;
  country: string; city: string; email?: string; password: string;
}

export interface AuthProvider {
  signIn(input: SignInInput): Promise<{ ok: boolean; user?: AuthUser; error?: string }>;
  register(input: RegisterInput): Promise<{ ok: boolean; status: AuthUser['status']; name: string }>;
}

/** Demo provider — any non-empty phone succeeds; registration returns "pending". */
export class DemoAuthProvider implements AuthProvider {
  async signIn(input: SignInInput) {
    const phone = (input.phone || '').trim();
    const user: AuthUser = {
      id: 'u_ahmed', name: { ar: 'أحمد الشمري', en: 'Ahmed Al-Shammari' },
      phone, role: 'rep', company: 'National Distribution Co.', status: 'active',
    };
    return { ok: true, user };
  }
  async register(input: RegisterInput) {
    return { ok: true, status: 'pending' as const, name: input.name || '' };
  }
}

/**
 * Supabase Auth provider (scaffold). Wire to Supabase Auth (phone OTP or email)
 * when NEXT_PUBLIC_SUPABASE_URL + keys are set. Left as a documented extension
 * point so the route handlers already depend on the interface, not the impl.
 */
export class SupabaseAuthProvider implements AuthProvider {
  async signIn(): Promise<{ ok: boolean; user?: AuthUser; error?: string }> {
    throw new Error('SupabaseAuthProvider not yet implemented — see NEXT_STEPS.md');
  }
  async register(): Promise<{ ok: boolean; status: AuthUser['status']; name: string }> {
    throw new Error('SupabaseAuthProvider not yet implemented — see NEXT_STEPS.md');
  }
}

let provider: AuthProvider | null = null;

export function getAuth(): AuthProvider {
  if (provider) return provider;
  provider = process.env.AUTH_PROVIDER === 'supabase' ? new SupabaseAuthProvider() : new DemoAuthProvider();
  return provider;
}
