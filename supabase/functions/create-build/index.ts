import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BuildRequest {
  appName: string;
  appUrl: string;
  targetOs: "windows" | "macos" | "linux";
  framework: "electron" | "tauri";
  iconBase64?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { appName, appUrl, targetOs, framework, iconBase64 } = await req.json() as BuildRequest;

    // Validate required fields
    if (!appName || !appUrl || !targetOs || !framework) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios não preenchidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    try {
      new URL(appUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: "URL inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from auth header if present
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    console.log(`Creating build for ${appName} (${targetOs}/${framework}) by user ${userId || "anonymous"}`);

    // Create the build record
    const { data: build, error: insertError } = await supabase
      .from("builds")
      .insert({
        user_id: userId,
        app_name: appName,
        app_url: appUrl,
        target_os: targetOs,
        framework: framework,
        icon_url: iconBase64 ? "data:image/png;base64," + iconBase64.substring(0, 100) + "..." : null,
        status: "queued",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar build: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Build created with id: ${build.id}`);

    // Simulate build process asynchronously using EdgeRuntime.waitUntil
    const processBuild = async () => {
      try {
        // Update to building status
        await new Promise(resolve => setTimeout(resolve, 2000));
        await supabase
          .from("builds")
          .update({ status: "building" })
          .eq("id", build.id);

        console.log(`Build ${build.id} status: building`);

        // Simulate build time
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Generate a mock download URL (in production, this would be the actual installer)
        const fileExtension = targetOs === "windows" ? "exe" : targetOs === "macos" ? "dmg" : "AppImage";
        const downloadUrl = `https://storage.lovable.dev/builds/${build.id}/${appName.replace(/\s+/g, "-").toLowerCase()}-${targetOs}.${fileExtension}`;

        // Mark as completed
        await supabase
          .from("builds")
          .update({ 
            status: "completed",
            download_url: downloadUrl
          })
          .eq("id", build.id);

        console.log(`Build ${build.id} completed: ${downloadUrl}`);
      } catch (err) {
        console.error(`Build ${build.id} failed:`, err);
        await supabase
          .from("builds")
          .update({ 
            status: "failed",
            error_message: err instanceof Error ? err.message : "Erro desconhecido"
          })
          .eq("id", build.id);
      }
    };

    // Start background task using globalThis for Deno Edge Runtime
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof globalThis.EdgeRuntime !== "undefined") {
      // @ts-ignore
      globalThis.EdgeRuntime.waitUntil(processBuild());
    } else {
      // Fallback: run without waiting
      processBuild();
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        buildId: build.id,
        message: "Build iniciado com sucesso"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-build error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
