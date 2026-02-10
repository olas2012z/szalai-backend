// server.js
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "1mb" })); // <-- to eliminuje "Bad Request" przy JSON
app.use(express.urlencoded({ extended: true }));

// --- Rate limit (żeby nikt nie nabił kosztów) ---
app.use("/ask", rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 zapytań/min na IP
  standardHeaders: true,
  legacyHeaders: false
}));

// --- Healthcheck ---
app.get("/", (req, res) => {
  res.status(200).send("SzalAI backend OK");
});

function brandSwap(text) {
  return String(text || "")
    .replace(/ChatGPT/gi, "SzalAI")
    .replace(/OpenAI/gi, "SzalAI");
}

async function callOpenAI(message) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "SzalAI: brak OPENAI_API_KEY na Render (Environment Variables) 🔑";
  }

  // Node 18+ ma global fetch (u Ciebie Node 24 jest OK)
  // Użyjemy /v1/responses (nowe), a jak nie zadziała to fallback na /v1/chat/completions
  const system = "Jesteś SzalAI. Odpowiadasz po polsku, krótko i konkretnie. Bez udawania, że jesteś oficjalnym ChatGPT.";

  // 1) Responses API
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: message }
        ],
        max_output_tokens: 300
      })
    });

    if (r.ok) {
      const data = await r.json();
      // output_text bywa dostępne w niektórych SDK, ale w REST parsujemy bezpiecznie:
      const text =
        data.output?.[0]?.content?.map(c => c.text).join("") ||
        data.output_text ||
        "";
      if (text.trim()) return text.trim();
    } else {
      // jeśli endpoint/model niedostępny, polecimy fallback
      // (nie przerywamy od razu)
    }
  } catch (e) {
    // fallback niżej
  }

  // 2) Chat Completions fallback
  const r2 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: message }
      ],
      max_tokens: 300
    })
  });

  if (!r2.ok) {
    const t = await r2.text().catch(() => "");
    return `SzalAI: błąd OpenAI (${r2.status}) ${t.slice(0, 120)}`;
  }

  const data2 = await r2.json();
  return data2.choices?.[0]?.message?.content?.trim() || "SzalAI: brak odpowiedzi 😅";
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

// --- Render port binding ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("SzalAI backend działa na porcie", PORT);
});
