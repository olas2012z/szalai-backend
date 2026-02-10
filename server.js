import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 🔴 TU WKLEJASZ SWOJE API KEY (TYLKO TU, NIE W ROBLOXIE)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Brak OPENAI_API_KEY w Environment Variables!");
}

// Endpoint, który woła Roblox
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.json({ reply: "SzalAI: napisz coś 😉" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "Jesteś SzalAI. Mów po polsku. Gadaj jak ziom. Pomagaj w Roblox Lua i skryptach."
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    const reply =
      data.output_text ||
      "SzalAI: nie udało się wygenerować odpowiedzi 😅";

    // Branding (na wszelki wypadek)
    const branded = reply
      .replace(/ChatGPT/gi, "SzalAI")
      .replace(/OpenAI/gi, "SzalAI");

    res.json({ reply: branded });

  } catch (err) {
    console.error(err);
    res.json({ reply: "SzalAI: błąd serwera 😕" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log("SzalAI backend działa na porcie", PORT);
});
