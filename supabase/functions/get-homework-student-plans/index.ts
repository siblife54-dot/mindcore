import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";

Deno.serve((request: Request) => handleRequest(request, {
  createSupabase: () => {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Missing server configuration");
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  },
  fetchTelegram: fetch,
}));
