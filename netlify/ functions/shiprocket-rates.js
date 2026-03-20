// netlify/functions/shiprocket-rates.js
// Proxies Shiprocket rate calculator — keeps credentials server-side

const SENDER_PINCODE  = "560072";
const SENDER_CITY     = "Bangalore";
const SENDER_STATE    = "Karnataka";
const SENDER_COUNTRY  = "India";

// Approximate package weights (grams) by size + frame
const WEIGHTS = {
  A5: { none: 150,  standard: 500,  premium: 700  },
  A4: { none: 300,  standard: 900,  premium: 1200 },
  A3: { none: 600,  standard: 1800, premium: 2400 },
};

// Approximate dimensions (cm) by size
const DIMENSIONS = {
  A5: { length: 22, breadth: 16, height: 1 },
  A4: { length: 32, breadth: 24, height: 1 },
  A3: { length: 46, breadth: 34, height: 2 },
};

exports.handler = async function(event) {
  // only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { pincode, size = "A4", frame = "none" } = body;

  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid pincode" }) };
  }

  try {
    // Step 1: Authenticate with Shiprocket
    const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:    process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
      }),
    });

    const authData = await authRes.json();

    if (!authData.token) {
      console.error("Shiprocket auth failed:", authData);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Shiprocket authentication failed" }),
      };
    }

    const token = authData.token;
    const weight    = WEIGHTS[size][frame] / 1000; // convert to kg
    const dims      = DIMENSIONS[size];

    // Step 2: Fetch courier rates
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
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const ratesData = await ratesRes.json();

    if (!ratesData.data || !ratesData.data.available_courier_companies) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "No couriers available for this pincode" }),
      };
    }

    // Step 3: Pick best options to return
    const couriers = ratesData.data.available_courier_companies
      .filter(c => c.rate > 0)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 4)
      .map(c => ({
        name:         c.courier_name,
        rate:         Math.ceil(c.rate),
        etd:          c.etd || c.estimated_delivery_days || "3-5 days",
      }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couriers }),
    };

  } catch (err) {
    console.error("Shiprocket error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Something went wrong fetching rates" }),
    };
  }
};
