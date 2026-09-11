import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";

function cleanBaseUrl(value = "") { return value.trim().replace(/\/$/, ""); }

async function openAICompatibleGenerate(baseUrl: string, apiKey: string, model: string, prompt: string) {
  const response = await fetch(`${cleanBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are an infinite spatial-knowledge-engine generator. Return ONLY valid JSON with keys text, asciiArt, prompts. text should be concise Markdown and include 2 to 4 key concepts as markdown links in the exact form [Search Term](Search Term). prompts must contain exactly 3 useful follow-up questions." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Provider returned no content");
  return typeof content === "string" ? JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()) : content;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: "50mb" }));
  const allowedOrigins = (process.env.CORS_ORIGINS || "*").split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (allowedOrigins.includes("*") || (requestOrigin && allowedOrigins.includes(requestOrigin))) res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes("*") ? "*" : requestOrigin!);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Gridscape-Provider, X-Gridscape-Api-Key, X-Gridscape-Model, X-Gridscape-Base-URL");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const envGemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { headers: { "User-Agent": "gridscape" } } });
  app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Gridscape", version: "2" }));

  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });
      const provider = String(req.headers["x-gridscape-provider"] || process.env.AI_PROVIDER || "gemini").toLowerCase();
      const apiKey = String(req.headers["x-gridscape-api-key"] || "");
      const model = String(req.headers["x-gridscape-model"] || process.env.OPENAI_MODEL || GEMINI_MODEL);
      const baseUrl = String(req.headers["x-gridscape-base-url"] || process.env.OPENAI_BASE_URL || "");

      if ((provider === "openai" || provider === "custom") && baseUrl) {
        const responseData = await openAICompatibleGenerate(baseUrl, apiKey, model, prompt);
        return res.json({ text: responseData.text || "No text", asciiArt: responseData.asciiArt || "", prompts: Array.isArray(responseData.prompts) ? responseData.prompts.slice(0, 3) : [] });
      }

      const ai = provider === "gemini" && apiKey ? new GoogleGenAI({ apiKey }) : envGemini;
      const textResponse = await ai.models.generateContent({
        model: provider === "gemini" ? model : GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: "You are an infinite spatial-knowledge-engine generator. Respond in JSON with text, asciiArt, and prompts. text should be concise and informative and must wrap 2 to 4 key concepts as markdown links using [Search Term](Search Term). prompts must contain exactly 3 follow-up questions.",
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, asciiArt: { type: Type.STRING }, prompts: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["text", "prompts"] },
        },
      });
      const rawText = (textResponse.text || "{}").replace(/```(json)?/gi, "").trim();
      res.json(JSON.parse(rawText));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error?.message || "Failed to generate text content." });
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt, imageBase64 } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });
      const apiKey = String(req.headers["x-gridscape-api-key"] || "");
      const provider = String(req.headers["x-gridscape-provider"] || process.env.AI_PROVIDER || "gemini").toLowerCase();
      const ai = provider === "gemini" && apiKey ? new GoogleGenAI({ apiKey }) : envGemini;
      const parts: any[] = [{ text: "Strictly black and white editorial style photography. Single subject. No text inside the image. No grid format, no multiple panels, just one single cohesive image. High-resolution, cinematic lighting. For abstract or scientific concepts, do NOT depict people unless specifically requested. " + prompt }];
      if (imageBase64) { const match = imageBase64.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/s); if (match) parts.unshift({ inlineData: { mimeType: match[1], data: match[2] } }); }
      const imageResponse = await ai.models.generateContent({ model: GEMINI_IMAGE_MODEL, contents: { parts }, config: { imageConfig: { aspectRatio: "4:3" } } as any });
      let base64EncodeString = "";
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) { if (part.inlineData) { base64EncodeString = part.inlineData.data; break; } }
      res.json(base64EncodeString ? { imageUrl: `data:image/jpeg;base64,${base64EncodeString}` } : { imageUrl: null, message: "No image generated" });
    } catch (error: any) { console.error(error); res.json({ imageUrl: null, fallback: true }); }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}
startServer();
