import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GenerationType = "button" | "image" | "logo" | "effect";

const systemPrompts: Record<GenerationType, string> = {
  button: `You are an expert UI developer. Generate clean, modern HTML/CSS button code based on the user's description.
Return ONLY valid HTML and CSS code. Include both the HTML markup and CSS styles.
Use modern CSS features and make the button responsive and accessible.
Format: Return a code block with HTML first, then CSS.`,

  image: `You are an expert web developer. Generate HTML/CSS code for image components, galleries, or image effects.
Return ONLY valid HTML and CSS code. Include responsive design and modern techniques.
Format: Return a code block with HTML first, then CSS.`,

  logo: `You are an expert SVG and logo designer. Generate SVG code for logos based on the user's description.
Return ONLY valid SVG code that can be used directly in HTML.
Make the SVG scalable and include proper viewBox attributes.
Use modern design principles and clean paths.`,

  effect: `You are an expert CSS animator. Generate CSS animations, transitions, and visual effects code.
Return ONLY valid CSS code with optional HTML structure if needed.
Include keyframes, transitions, and any JavaScript if required for the effect.
Make effects performant and smooth.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, type } = await req.json() as { prompt: string; type: GenerationType };
    
    if (!prompt || !type) {
      throw new Error("Missing prompt or type");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = systemPrompts[type];
    if (!systemPrompt) {
      throw new Error("Invalid generation type");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos para continuar." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro no serviço de IA");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
