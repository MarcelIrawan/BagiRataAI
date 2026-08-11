// netlify/functions/analyze-receipt.js
exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ message: 'Preflight OK' })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { image, mimeType } = body;

    if (!image || !mimeType) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ error: "Data gambar atau mimeType tidak lengkap." })
      };
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("OPENROUTER_API_KEY belum dikonfigurasi di Netlify Environment Variables.");
      return {
        statusCode: 500,
        headers: headers,
        body: JSON.stringify({ error: "Variabel OPENROUTER_API_KEY belum dipasang di dashboard Netlify." })
      };
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
      return {
        statusCode: response.status,
        headers: headers,
        body: JSON.stringify({ error: "Gagal memproses gambar melalui OpenRouter." })
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error("Server Error:", error);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: "Terjadi kesalahan internal pada server Netlify Function." })
    };
  }
};
