import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.AI_GATEWAY_API_KEY;
        if (!apiKey) return new Response("Missing AI_GATEWAY_API_KEY", { status: 500 });
        const gatewayUrl = process.env.AI_GATEWAY_URL;
        if (!gatewayUrl) return new Response("Missing AI_GATEWAY_URL", { status: 500 });
        const inForm = await request.formData();
        const file = inForm.get("file");
        if (!(file instanceof File)) return new Response("Missing file", { status: 400 });
        if (file.size > 20 * 1024 * 1024) return new Response("File too large", { status: 413 });

        const type = file.type.split(";")[0];
        const extMap: Record<string, string> = {
          "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3",
          "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav",
        };
        const ext = extMap[type] ?? "webm";

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, `recording.${ext}`);

        const r = await fetch(`${gatewayUrl}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });
        if (!r.ok) return new Response(await r.text(), { status: r.status });
        const json = await r.json();
        return Response.json({ text: json.text ?? "" });
      },
    },
  },
});