import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { ok: false, error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  const { telegram_id, username } = await req.json();

  if (!telegram_id) {
    return Response.json(
      { ok: false, error: "telegram_id is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const telegramId = Number(telegram_id);

  if (!Number.isFinite(telegramId)) {
    return Response.json(
      { ok: false, error: "telegram_id must be a number" },
      { status: 400, headers: corsHeaders },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existingAccount, error: existingError } = await supabase
    .from("accounts")
    .select("id,login,password")
    .eq("issued_to_telegram_id", telegramId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { ok: false, error: existingError.message },
      { status: 500, headers: corsHeaders },
    );
  }

  if (existingAccount) {
    return Response.json(
      {
        ok: true,
        already_issued: true,
        login: existingAccount.login,
        password: existingAccount.password,
        admin_url: "https://siblife54-dot.github.io/mindcore/admin.html",
      },
      { headers: corsHeaders },
    );
  }

  const { data: freeAccount, error: freeError } = await supabase
    .from("accounts")
    .select("id,login,password")
    .eq("is_issued", false)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (freeError) {
    return Response.json(
      { ok: false, error: freeError.message },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!freeAccount) {
    return Response.json(
      { ok: false, error: "Нет свободных тестовых кабинетов" },
      { status: 404, headers: corsHeaders },
    );
  }

  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      is_issued: true,
      issued_to_telegram_id: telegramId,
      issued_to_username: username ?? null,
      issued_at: new Date().toISOString(),
    })
    .eq("id", freeAccount.id);

  if (updateError) {
    return Response.json(
      { ok: false, error: updateError.message },
      { status: 500, headers: corsHeaders },
    );
  }

  return Response.json(
    {
      ok: true,
      already_issued: false,
      login: freeAccount.login,
      password: freeAccount.password,
      admin_url: "https://siblife54-dot.github.io/mindcore/admin.html",
    },
    { headers: corsHeaders },
  );
});
