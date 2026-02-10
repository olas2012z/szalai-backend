import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/ask", rateLimit({ windowMs: 60 * 1000, max: 30 }));

// 🔥 To MUSI się zmienić, żebyś wiedział, że to nowy deploy
app.get("/", (req, res) => res.status(200).send("SzalAI backend OK ✅ (GEMINI v2.0.0)"));

app.get("/version", (req, res) =>
  res.status(200).json({
    ok: true,
    llm: "gemini",
    v: "2.0.0",
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
  })
);

function brandSwap(text) {
  return String(text || "").replace(/ChatGPT/gi, "SzalAI").replace(/OpenAI/gi, "SzalAI");
}
const preview = (t, n = 200) => String(t || "").slice(0, n);

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "SzalAI DEBUG: brak GEMINI_API_KEY na Render ❌";

  // Najczęściej działa:
  // gemini-1.5-flash / gemini-1.5-pro / gemini-2.0-flash
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  // Używam v1beta, bo to najpewniejsze z AI Studio API key
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents: [{ role: "user", parts: [{ text: `Odpowiadaj po polsku, krótko.\n\nUżytkownik: ${message}` }] }],
    generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
  };

  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body)
  });

  const raw = await r.text().catch(() => "");
  if (!r.ok) return `SzalAI DEBUG: Gemini ERROR (${r.status}) ${preview(raw)}`;

  let data;
  try { data = JSON.parse(raw); } catch { return `SzalAI DEBUG: Gemini non-JSON: ${preview(raw)}`; }

  const text =
    data?.candidates?.[0]?.content?.parts?.map(p => (typeof p?.text === "string" ? p.text : "")).join("").trim() || "";

  return text || "SzalAI DEBUG: Gemini OK, ale pusto ❌";
}

app.post("/ask", async (req, res) => {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ reply: "SzalAI: wyślij pole message jako tekst." });
  }

  const reply = await callGemini(message.trim().slice(0, 1200));
  res.json({ reply: brandSwap(reply) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("SzalAI backend działa na porcie", PORT));
