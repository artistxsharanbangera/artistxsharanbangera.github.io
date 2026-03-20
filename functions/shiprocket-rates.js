// functions/shiprocket-rates.js
// Cloudflare Pages Function — proxies Shiprocket rate calculator

const SENDER_PINCODE = "560072";

const WEIGHTS = {
  A5: { none: 0.15, standard: 0.5,  premium: 0.7  },
  A4: { none: 0.3,  standard: 0.9,  premium: 1.2  },
  A3: { none: 0.6,  standard: 1.8,  premium: 2.4  },
};

const DIMENSIONS = {
  A5: { length: 22, breadth: 16, height: 1 },
  A4: { length: 32, breadth: 24, height: 1 },
  A3: { length: 46, breadth: 34, height: 2 },
};

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
    const { pincode, size = "A4", frame = "none" } = body;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return Response.json({ error: "Invalid pincode" }, { status: 400, headers: CORS });
    }

    // Step 1: Authenticate
    const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:    env.SHIPROCKET_EMAIL,
        password: env.SHIPROCKET_PASSWORD,
      }),
    });

    const authData = await authRes.json();
    if (!authData.token) {
      return Response.json({ error: "Shiprocket authentication failed" }, { status: 502, headers: CORS });
    }

    const weight = WEIGHTS[size]?.[frame] ?? 0.3;
    const dims   = DIMENSIONS[size] ?? DIMENSIONS["A4"];

    // Step 2: Fetch rates
    const params = new URLSearchParams({
      pickup_postcode:   SENDER_PINCODE,
      delivery_postcode: pincode,
      weight:            weight,
      length:            dims.length,
      breadth:           dims.breadth,
      height:            dims.height,
      cod:               0,
    });

    const ratesRes = await fetch(
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?${params}`,
      { headers: { Authorization: `Bearer ${authData.token}` } }
    );

    const ratesData = await ratesRes.json();
    const available = ratesData?.data?.available_courier_companies;

    if (!available || available.length === 0) {
      return Response.json({ error: "No couriers available for this pincode" }, { headers: CORS });
    }

    // Step 3: Filter to DTDC/Delhivery, pick cheapest
    const preferred = ["dtdc", "delhivery"];
    let couriers = available
      .filter(c => c.rate > 0 && preferred.some(p => c.courier_name.toLowerCase().includes(p)))
      .sort((a, b) => a.rate - b.rate);

    // fallback to cheapest if preferred not found
    if (couriers.length === 0) {
      const cheapest = available.filter(c => c.rate > 0).sort((a, b) => a.rate - b.rate)[0];
      if (cheapest) couriers = [cheapest];
    }

    // keep only the cheapest one, add ₹100 packaging
    const result = couriers.slice(0, 1).map(c => ({
      name: c.courier_name,
      rate: Math.ceil(c.rate) + 100,
      etd:  c.etd || "3-5 days",
    }));

    return Response.json({ couriers: result }, { headers: CORS });

  } catch (err) {
    console.error("Shiprocket error:", err);
    return Response.json({ error: "Something went wrong" }, { status: 500, headers: CORS });
  }
}
