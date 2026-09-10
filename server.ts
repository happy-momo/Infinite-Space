// Express 服务器入口：在开发模式挂载 Vite 中间件，生产模式托管 dist/ 静态文件。
// 提供 REST API：LLM 设置读写/测试、画布数据持久化、AI 整理、AI 总结、链接元信息。
// Express server entry — Vite middleware in dev, static dist/ in production, plus the REST API.
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  loadLlmConfig,
  saveLlmConfig,
  publicConfig,
  loadState,
  saveState,
  AppState,
} from "./server/storage";
import { organizeNodes, summarizeBoard, testConnection, LlmError } from "./server/llm";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "127.0.0.1";

  // Large enough for base64 images stored in canvas state.
  app.use(express.json({ limit: "50mb" }));

  // ---- LLM settings ----
  app.get("/api/settings", (_req, res) => {
    res.json(publicConfig(loadLlmConfig()));
  });

  app.post("/api/settings", (req, res) => {
    const { baseUrl, model, apiKey } = req.body || {};
    if (typeof baseUrl !== "string" || !baseUrl.trim()) {
      return res.status(400).json({ error: "Base URL 不能为空" });
    }
    if (typeof model !== "string" || !model.trim()) {
      return res.status(400).json({ error: "模型名称不能为空" });
    }
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      return res.status(400).json({ error: "Base URL 必须以 http(s):// 开头" });
    }
    const prev = loadLlmConfig();
    saveLlmConfig({
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      // Blank key keeps the previously stored one.
      apiKey: typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : prev?.apiKey || "",
    });
    res.json(publicConfig(loadLlmConfig()));
  });

  // ---- Connectivity test ----
  app.post("/api/llm/test", async (req, res) => {
    try {
      const stored = loadLlmConfig() || { baseUrl: "", model: "", apiKey: "" };
      const b = req.body || {};
      const cfg = {
        baseUrl: typeof b.baseUrl === "string" && b.baseUrl.trim() ? b.baseUrl.trim() : stored.baseUrl,
        model: typeof b.model === "string" && b.model.trim() ? b.model.trim() : stored.model,
        apiKey: typeof b.apiKey === "string" && b.apiKey.trim() ? b.apiKey.trim() : stored.apiKey,
      };
      if (!cfg.baseUrl) return res.status(400).json({ ok: false, error: "请填写 Base URL" });
      if (!cfg.model) return res.status(400).json({ ok: false, error: "请填写模型名称" });
      if (!cfg.apiKey) return res.status(400).json({ ok: false, error: "请填写 API Key 后再测试" });
      const reply = await testConnection(cfg);
      res.json({ ok: true, reply: String(reply).slice(0, 200) });
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      res.status(502).json({ ok: false, error: msg });
    }
  });

  // ---- Canvas data persistence ----
  app.get("/api/data", (_req, res) => {
    res.json(loadState() || {});
  });

  app.post("/api/data", (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Invalid data" });
    }
    saveState(body as AppState);
    res.json({ ok: true });
  });

  // ---- AI Organize (uses server-side LLM config) ----
  app.post("/api/organize", async (req, res) => {
    try {
      const cfg = loadLlmConfig();
      if (!cfg?.apiKey || !cfg.model || !cfg.baseUrl) {
        return res.status(400).json({ error: "请先在设置中配置 LLM（Base URL / 模型 / API Key）" });
      }
      const { nodes, edges } = req.body;
      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ error: "Invalid nodes data." });
      }
      const result = await organizeNodes(nodes, edges || [], cfg);
      res.json(result);
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      console.error("AI Organize error:", msg);
      res.status(502).json({ error: msg });
    }
  });

  // ---- AI Summarize / storyline (uses server-side LLM config) ----
  app.post("/api/summarize", async (req, res) => {
    try {
      const cfg = loadLlmConfig();
      if (!cfg?.apiKey || !cfg.model || !cfg.baseUrl) {
        return res.status(400).json({ error: "请先在设置中配置 LLM（Base URL / 模型 / API Key）" });
      }
      const { nodes, edges, instruction, style } = req.body;
      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ error: "Invalid nodes data." });
      }
      const summary = await summarizeBoard(nodes, edges || [], cfg, {
        instruction: typeof instruction === "string" ? instruction : undefined,
        style: typeof style === "string" ? style : undefined,
      });
      res.json({ summary });
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      console.error("AI Summarize error:", msg);
      res.status(502).json({ error: msg });
    }
  });

  // ---- Link metadata (best-effort title/favicon) ----
  app.get("/api/linkinfo", async (req, res) => {
    const url = typeof req.query.url === "string" ? req.query.url : "";
    if (!/^https?:\/\//i.test(url)) return res.json({ ok: false });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; InfiniteSpace/1.0)" },
      });
      clearTimeout(timer);
      const html = await resp.text();
      const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || "";
      const favicon =
        (html.match(
          /<link[^>]+rel=["']?(?:shortcut\s+)?icon["']?[^>]+href=["']([^"']+)["']/i,
        ) || [])[1] || "";
      let faviconUrl = "";
      try {
        faviconUrl = favicon ? new URL(favicon, url).href : new URL("/favicon.ico", url).href;
      } catch {
        faviconUrl = "";
      }
      res.json({ ok: true, title, favicon: faviconUrl });
    } catch {
      res.json({ ok: false });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Express 4 catch-all (the previous `*all` matched nothing in Express 4).
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
