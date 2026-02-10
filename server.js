// server.js (GPT-2 local in Node via transformers.js - NO POE)
// Render: set NODE_VERSION >= 18

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
    max: 20, // GPT-2 jest wolny -> mniej requestów
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ✅ HEALTHCHECK + VERSION
app.get("/", (req, res) => res.status(200).send("SzalAI backend OK ✅ (GPT-2)"));
app.get("/version", (req, res) =>
  res.status(200).json({
    ok: true,
    llm: "gpt2-local",
    v: "4.0.0",
    engine: "@xenova/transformers",
    model: "Xenova/gpt2",
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

// ---------------------------
// GPT-2 loader (lazy, once)
// ---------------------------
let pipeline = null;
let loading = null;

async function getGenerator() {
  if (pipeline) return pipeline;
  if (loading) return loading;

  loading = (async () => {
    // Dynamic import żeby Render nie próbował ładować przy starcie zanim wszystko gotowe
    const { pipeline: makePipeline } = await import("@xenova/transformers");

    // text-generation pipeline
    const gen = await makePipeline("text-generation", "Xenova/gpt2", {
      // CPU default
    });

    pipeline = gen;
    console.log("[GPT2] Model loaded: Xenova/gpt2");
    return pipeline;
  })();

  return loading;
}

function extractAfterMarker(full, marker = "SzalAI:") {
  const idx = full.lastIndexOf(marker);
  if (idx === -1) return full.trim();
  return full.slice(idx + marker.length).trim();
}

function cutTo1Sentence(s) {
  s = String(s || "").trim();
  if (!s) return s;
  // proste cięcie do 1 zdania
  const m = s.match(/(.+?[.!?])(\s|$)/);
  if (m) return m[1].trim();
  return s;
}

async function callGpt2(userMessage) {
  const gen = await getGenerator();

  // Krótki prompt, żeby GPT-2 mniej echo'ował
  const prompt =
    "Jesteś SzalAI. Odpowiadaj krótko i naturalnie po polsku. Nie powtarzaj wiadomości użytkownika.\n" +
    `Użytkownik: ${userMessage}\n` +
    "SzalAI:";

  // GPT-2 jest słaby i potrafi odpłynąć — daj mało tokenów
  const out = await gen(prompt, {
    max_new_tokens: 80,
    temperature: 0.9,
    top_p: 0.92,
    repetition_penalty: 1.15,
    do_sample: true,
  });

  // transformers.js zwraca array obiektów
  const text = out?.[0]?.generated_text || "";
  if (!text) return "Nie wiem. Spróbuj napisać inaczej.";

  let reply = extractAfterMarker(text, "SzalAI:");
  reply = cutTo1Sentence(reply);

  if (!reply || reply.length < 2) reply = "Nie jestem pewien. Napisz inaczej.";

  return reply;
}

app.post("/ask", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ reply: "SzalAI: wyślij pole message jako tekst." });
    }

    const safeMsg = message.trim().slice(0, 400); // krócej = szybciej/taniej
    console.log("[/ask] msg:", preview(safeMsg, 80));

    // GPT-2 local
    const reply = await callGpt2(safeMsg);

    res.json({ reply: brandSwap(reply) });
  } catch (err) {
    console.error("[/ask] ERROR:", err);
    res.status(500).json({ reply: "SzalAI: błąd serwera 😵" });
  }
});

// --- Render port binding ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("SzalAI backend działa na porcie", PORT);
});
