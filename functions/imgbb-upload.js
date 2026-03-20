// functions/imgbb-upload.js
// Cloudflare Pages Function — proxies ImgBB uploads

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    if (!body.image) {
      return Response.json({ error: "No image provided" }, { status: 400, headers: CORS });
    }

    const params = new URLSearchParams({
      key:   env.IMGBB_KEY,
      image: body.image,
      ...(body.name ? { name: body.name } : {}),
    });

    const res  = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body:   params,
    });

    const data = await res.json();

    if (!data.success) {
      return Response.json({ error: "ImgBB upload failed" }, { status: 502, headers: CORS });
    }

    return Response.json({ url: data.data.url }, { headers: CORS });

  } catch (err) {
    console.error("ImgBB error:", err);
    return Response.json({ error: "Upload failed" }, { status: 500, headers: CORS });
  }
}
