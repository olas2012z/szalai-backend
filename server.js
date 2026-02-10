// server.js (Gemini - AI Studio API Key)
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

// ✅ HEALTHCHECK + VERSION (żeby nie zgadywać co działa)
app.get("/", (req, res) => res.status(200).send("SzalAI backend OK ✅ (GEMINI)"));
app.get("/version", (req, res) =>
  res.status(200).json({
    ok: true,
    llm: "gemini",
    v: "2.1.0",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
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
 * Gemini (Google Generative Language API) - v1 endpoint.
 * API key passed via header x-goog-api-key.
 */
async function callGemini(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "SzalAI: brak GEMINI_API_KEY na Render (Environment Variables) 🔑";

  // Najpewniejszy szybki model:
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  // ✅ v1 (stabilny). v1beta potrafi mieć inne nazwy modeli.
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Odpowiadaj po polsku, krótko i konkretnie.\n" +
              "Jeśli pytanie jest niejasne, dopytaj.\n\n" +
              "Użytkownik: " +
              message,
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.7,
    },
  };

  const r = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    },
    15000
  );

  const raw = await r.text().catch(() => "");

  if (!r.ok) {
    return `SzalAI DEBUG: Gemini ERROR (${r.status}) ${preview(raw)}`;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return `SzalAI DEBUG: Gemini non-JSON: ${preview(raw)}`;
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim() || "";

  if (!text) return "SzalAI DEBUG: Gemini OK, ale pusto ❌";

  return text;
}

app.post("/ask", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ reply: "SzalAI: wyślij pole message jako tekst." });
    }

    const safeMsg = message.trim().slice(0, 1200);
    const reply = await callGemini(safeMsg);

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
