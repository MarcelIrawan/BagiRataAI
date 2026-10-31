// functions/api/analyze-receipt.js
//
// Cloudflare Pages Function. `functions/` sits at the repo root — NOT inside
// the static root `public/` — and this file path maps to the route
// `/api/analyze-receipt` via Pages file-based routing.
//
// ESM: package.json declares "type": "module". Pages reads the named export
// `onRequest` (a single handler for all methods, so non-POST still gets a 405
// instead of falling through to the static 404). Environment variables and
// secrets arrive via `context.env`, not `process.env`.

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const json = (status, payload) =>
  new Response(JSON.stringify(payload), { status, headers });

export const onRequest = async function(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json(200, { message: 'Preflight OK' });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const raw = await request.text();
    const { image, mimeType } = JSON.parse(raw || '{}');

    if (!image || !mimeType) {
      return json(400, { error: "Data gambar atau mimeType tidak lengkap." });
    }

    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("OPENROUTER_API_KEY belum dikonfigurasi di Environment Variables Cloudflare Pages.");
      return json(500, { error: "Variabel OPENROUTER_API_KEY belum dipasang di dashboard Cloudflare (Settings > Environment variables)." });
    }

    const endpoint = "https://openrouter.ai/api/v1/chat/completions";
    const model = "xiaomi/mimo-v2.5";

    const prompt = `Analisis foto struk/nota ini dan kembalikan JSON persis seperti format berikut tanpa markdown tambahan:
{
  "merchant": "Nama Toko/Restoran",
  "items": [
    {"name": "Nama Menu 1", "qty": 1, "price": 25000}
  ],
  "tax": 5000,
  "service": 2000,
  "discount": 0
}
Catatan: "price" adalah harga SATUAN. Jika ada pajak masukkan ke tax, biaya layanan ke service, diskon ke discount.`;

    const payload = {
      model: model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${image}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Title': 'BagiRata AI - Serverless'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenRouter Error Response:", response.status, errText);
      return json(response.status, { error: "Gagal memproses gambar melalui OpenRouter." });
    }

    const data = await response.json();
    return json(200, data);

  } catch (error) {
    console.error("Server Error:", error);
    return json(500, { error: "Terjadi kesalahan internal pada server Cloudflare Pages Function." });
  }
};