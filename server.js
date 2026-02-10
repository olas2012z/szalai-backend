// server.js
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

// ---- HEALTH ----
app.get("/", (req, res) => res.status(200).send("SzalAI backend OK ✅"));
app.get("/ping", (req, res) => res.status(200).json({ ok: true, where: "ping" }));
app.get("/version", (req, res) =>
  res.status(200).json({ ok: true, name: "szalai-backend", v: "1.0.2" })
);

app.get("/ask", (req, res) => {
  res.status(200).json({
    ok: true,
    hint: 'Użyj POST /ask z JSON: {"message":"siema"}',
  });
});

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

function extractResponsesText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (Array.isArray(data?.output)) {
    let out = "";
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string") out += c.text;
          else if (typeof c?.text?.value === "string") out += c.text.value;
        }
      }
    }
    if (out.trim()) return out.trim();
  }
  return "";
}

async function callOpenAI(message) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "SzalAI DEBUG: brak OPENAI_API_KEY na Render ❌";

  const system = "Jesteś SzalAI. Odpowiadasz po polsku, krótko i konkretnie.";

  // 1) Responses
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
          max_output_tokens: 250,
        }),
      },
      15000
    );

    const raw = await r.text().catch(() => "");

    if (!r.ok) {
      return `SzalAI DEBUG: OpenAI /responses ERROR (${r.status}) ${preview(raw)}`;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return `SzalAI DEBUG: /responses non-JSON: ${preview(raw)}`;
    }

    const text = extractResponsesText(data);
    if (text) return text;

    return "SzalAI DEBUG: /responses OK, ale pusto ❌";
  } catch (e) {
    // fallback niżej
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
        max_tokens: 250,
      }),
    },
    15000
  );

  const raw2 = await r2.text().catch(() => "");

  if (!r2.ok) {
    return `SzalAI DEBUG: OpenAI /chat ERROR (${r2.status}) ${preview(raw2)}`;
  }

  let data2;
  try {
    data2 = JSON.parse(raw2);
  } catch {
    return `SzalAI DEBUG: /chat non-JSON: ${preview(raw2)}`;
  }

  const out = data2?.choices?.[0]?.message?.content?.trim();
  if (out) return out;

  return "SzalAI DEBUG: /chat OK, ale pusto ❌";
}

app.post("/ask", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ reply: "SzalAI: wyślij pole message jako tekst." });
    }

    const safeMsg = message.trim().slice(0, 1200);
    const reply = await callOpenAI(safeMsg);

    res.json({ reply: brandSwap(reply) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "SzalAI: błąd serwera 😵" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("SzalAI backend działa na porcie", PORT));
