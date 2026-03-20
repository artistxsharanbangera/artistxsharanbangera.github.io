// netlify/functions/imgbb-upload.js
// Proxies ImgBB uploads — keeps API key server-side

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // Forward the base64 image to ImgBB using the server-side key
    const body = JSON.parse(event.body);

    if (!body.image) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    const params = new URLSearchParams({
      key:   process.env.IMGBB_KEY,
      image: body.image,
      ...(body.name ? { name: body.name } : {}),
    });

    const res = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: params,
    });

    const data = await res.json();

    if (!data.success) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "ImgBB upload failed", detail: data }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: data.data.url }),
    };

  } catch (err) {
    console.error("ImgBB proxy error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Upload failed" }),
    };
  }
};
