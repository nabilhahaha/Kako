/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FI_SUPABASE_URL: string;
  readonly VITE_FI_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_FI_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
