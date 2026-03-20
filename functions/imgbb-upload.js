// functions/imgbb-upload.js
// Cloudflare Pages Function — proxies ImgBB uploads

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    if (!body.image) {
      return Response.json({ error: "No image provided" }, { status: 400 });
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
      return Response.json({ error: "ImgBB upload failed" }, { status: 502 });
    }

    return Response.json({ url: data.data.url });

  } catch (err) {
    console.error("ImgBB error:", err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
