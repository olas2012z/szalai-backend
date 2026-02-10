// server.js
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Rate limit ---
app.use(
  "/ask",
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Healthcheck ---
app.get("/", (req, res) => {
  res.status(200).send("SzalAI backend OK");
});

function brandSwap(text) {
  return String(text || "")
    .replace(/ChatGPT/gi, "SzalAI")
    .replace(/OpenAI/gi, "SzalAI");
}

// ------- helpers -------
function safeSlice(s, n = 240) {
  return String(s || "").slice(0, n);
}

function extractResponsesText(data) {
  // Najlepszy przypadek: SDK helper czasem jest w JSON
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // Standard: output -> [{type:"message", content:[{type:"output_text", text:"..."}]}]
  if (Array.isArray(data?.output)) {
    let out = "";
    for (const item of data.output) {
      // często item.type === "message"
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          // najczęściej: { type: "output_text", text: "..." }
          if (typeof c?.text === "string") out += c.text;
          // czasem: { type:"output_text", text:{value:"..."} } (różne warianty)
          else if (typeof c?.text?.value === "string") out += c.text.value;
        }
      }
    }
    if (out.trim()) return out.trim();
  }

  return "";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAI(message) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "SzalAI: brak OPENAI_API_KEY na Render (Environment Variables) 🔑";
  }

  const system =
    "Jesteś SzalAI. Odpowiadasz po polsku, krótko i konkretnie. Bez udawania, że jesteś oficjalnym ChatGPT.";

  // 1) Responses API (rekomendowane)
  try {
    const r = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
          max_output_tokens: 300,
        }),
      },
      15000
    );

    const raw = await r.text().catch(() => "");

    if (!r.ok) {
      // pokaż status i początek body (np. 401, 429, 500)
      return `SzalAI: błąd OpenAI /responses (${r.status}) ${safeSlice(raw, 160)}`;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return `SzalAI: /responses zwróciło nie-JSON: ${safeSlice(raw, 160)}`;
    }

    const text = extractResponsesText(data);
    if (text) return text;

    // jeśli Responses dało pusto, polecimy fallback
  } catch (e) {
    // timeout / abort / network -> fallback
  }

  // 2) Chat Completions fallback
  const r2 = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
        max_tokens: 300,
      }),
    },
    15000
  );

  const raw2 = await r2.text().catch(() => "");

  if (!r2.ok) {
    return `SzalAI: błąd OpenAI /chat (${r2.status}) ${safeSlice(raw2, 160)}`;
  }

  let data2;
  try {
    data2 = JSON.parse(raw2);
  } catch (e) {
    return `SzalAI: /chat zwróciło nie-JSON: ${safeSlice(raw2, 160)}`;
  }

  return (
    data2?.choices?.[0]?.message?.content?.trim() || "SzalAI: brak odpowiedzi 😅"
  );
}

// ------- route -------
app.post("/ask", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res
        .status(400)
        .json({ reply: "SzalAI: wyślij pole message jako tekst." });
    }

    const safeMsg = message.trim().slice(0, 1200);
    const reply = await callOpenAI(safeMsg);

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
