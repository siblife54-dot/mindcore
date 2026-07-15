import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const { course_id, bot_token, button_title, webapp_url } = await req.json();

    if (!course_id || !bot_token || !button_title || !webapp_url) {
      return jsonResponse(
        { ok: false, error: "Не заполнены обязательные поля" },
        400
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: "Не настроены Supabase secrets" },
        500
      );
    }

    const getMeResponse = await fetch(
      `https://api.telegram.org/bot${bot_token}/getMe`
    );

    const getMeData = await getMeResponse.json();

    if (!getMeData.ok) {
      return jsonResponse(
        { ok: false, error: "Неверный Bot Token" },
        400
      );
    }

    const botUsername = getMeData.result?.username;

    const setMenuResponse = await fetch(
      `https://api.telegram.org/bot${bot_token}/setChatMenuButton`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          menu_button: {
            type: "web_app",
            text: button_title,
            web_app: {
              url: webapp_url,
            },
          },
        }),
      }
    );

    const setMenuData = await setMenuResponse.json();

    if (!setMenuData.ok) {
      return jsonResponse(
        {
          ok: false,
          error:
            setMenuData.description ||
            "Telegram не смог установить кнопку WebApp",
        },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: tokenStoreError } = await supabase.rpc(
      "store_course_telegram_bot_token",
      {
        p_course_id: course_id,
        p_bot_token: bot_token,
      }
    );

    if (tokenStoreError) {
      console.error("Token store error", {
        course_id,
        error: tokenStoreError.message,
      });

      return jsonResponse(
        {
          ok: false,
          error: "Не удалось безопасно сохранить Telegram Bot Token",
        },
        500
      );
    }

    const { error: upsertError } = await supabase
      .from("course_integrations")
      .upsert(
        {
          course_id,
          telegram_bot_username: botUsername,
          telegram_button_title: button_title,
          telegram_webapp_url: webapp_url,
          telegram_connected: true,
          telegram_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "course_id" }
      );

    if (upsertError) {
      return jsonResponse(
        {
          ok: false,
          error: upsertError.message,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      bot_username: botUsername,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
