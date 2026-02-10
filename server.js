// server.js (POE API - OpenAI compatible)
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  "/ask",
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ✅ HEALTHCHECK + VERSION
app.get("/", (req, res) => res.status(200).send("SzalAI backend OK ✅ (POE)"));
app.get("/version", (req, res) =>
  res.status(200).json({
    ok: true,
    llm: "poe",
    v: "3.0.0",
    baseURL: "https://api.poe.com/v1",
    model: process.env.POE_MODEL || "Claude-Sonnet-4",
    hasPoeKey: !!process.env.POE_API_KEY,
  })
);

function brandSwap(text) {
  return String(text || "")
    .replace(/ChatGPT/gi, "SzalAI")
    .replace(/OpenAI/gi, "SzalAI");
}

function preview(t, n = 180) {
  return String(t || "").slice(0, n);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Poe OpenAI-compatible chat completions
 * POST https://api.poe.com/v1/chat/completions
 * Auth: Authorization: Bearer POE_API_KEY
 */
async function callPoe(message) {
  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) return "SzalAI: brak POE_API_KEY na Render (Environment Variables) 🔑";

  const model = process.env.POE_MODEL || "Claude-Sonnet-4";
  const url = "https://api.poe.com/v1/chat/completions";

  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "Odpowiadaj po polsku, krótko i konkretnie. Jeśli pytanie jest niejasne, dopytaj.",
      },
      { role: "user", content: message },
    ],
    temperature: 0.7,
    max_tokens: 300,
  };

  const r = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    15000
  );

  const raw = await r.text().catch(() => "");

  if (!r.ok) {
    // Poe zwraca błędy jak OpenAI-compatible; pokazujemy krótki debug
    return `SzalAI DEBUG: POE ERROR (${r.status}) ${preview(raw)}`;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return `SzalAI DEBUG: POE non-JSON: ${preview(raw)}`;
  }

  const text = data?.choices?.[0]?.message?.content?.trim?.() || "";
  if (!text) return "SzalAI DEBUG: POE OK, ale pusto ❌";

  return text;
}

app.post("/ask", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ reply: "SzalAI: wyślij pole message jako tekst." });
    }

    const safeMsg = message.trim().slice(0, 1200);
    const reply = await callPoe(safeMsg);

    res.json({ reply: brandSwap(reply) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "SzalAI: błąd serwera 😵" });
  }
});

// --- Render port binding ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("SzalAI backend działa na porcie", PORT);
});
