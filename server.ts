import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json({ limit: "50mb" }));
  const allowedOrigins = (process.env.CORS_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (allowedOrigins.includes("*") || (requestOrigin && allowedOrigins.includes(requestOrigin))) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes("*") ? "*" : requestOrigin!);
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt } = req.body;
      const textResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          systemInstruction: "You are an infinite spatial-knowledge-engine generator. Respond to the user's query by generating AI content in a specific JSON format. The format must contain: 'text' (AI-generated explanatory text detailing the topic. Use markdown if necessary, but keep it brief and impactful. CRITICAL: You MUST wrap 2 to 4 key concepts or interesting terms in your text as markdown links using the exact format `[Search Term](Search Term)`, so users can click them to branch off and explore that topic further!), 'asciiArt' (a minimalist, stylish 3-5 line ASCII or unicode line-art illustration visually representing the topic or concept), and 'prompts' (an array of exactly 3 string items containing suggested follow-up questions or sub-topics). Keep text concise and informative.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              asciiArt: { type: Type.STRING },
              prompts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["text", "prompts"],
          },
        },
      });

      let rawText = textResponse.text || "{}";
      rawText = rawText.replace(/```(json)?/gi, '').trim();
      const responseData = JSON.parse(rawText);
      res.json(responseData);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate text content." });
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt, imageBase64 } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      let parts: any[] = [{ text: "Strictly black and white editorial style photography. Single subject. No text inside the image. No grid format, no multiple panels, just one single cohesive image. High-resolution, cinematic lighting. For abstract or scientific concepts (like physics or chemistry), do NOT depict people unless specifically requested. " + prompt }];
      if (imageBase64) {
        const match = imageBase64.match(/^data:(image\/[a-zA-Z]*);base64,([^"]*)$/);
        if (match && match.length === 3) {
          parts.unshift({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      const imageResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: { parts },
        config: {
          imageConfig: { aspectRatio: "4:3" }
        } as any,
      });

      let base64EncodeString = "";
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          base64EncodeString = part.inlineData.data;
          break;
        }
      }

      if (base64EncodeString) {
        res.json({ imageUrl: `data:image/jpeg;base64,${base64EncodeString}` });
      } else {
        res.json({ imageUrl: null, message: "No image generated" });
      }
    } catch (error: any) {
      // Gracefully handle model quota / rate limits without throwing server errors
      res.json({ imageUrl: null, fallback: true });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
