import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY antes de usar o Supabase.");
  }

  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
