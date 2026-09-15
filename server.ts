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
import { organizeNodes, summarizeBoard, testConnection, streamLlm, associateNodes, analyzeChart, llmProposeEdgeRelations, LlmError } from "./server/llm";

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
      const { nodes, edges, instruction, style, mode, subsetLabel } = req.body;
      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ error: "Invalid nodes data." });
      }
      const summary = await summarizeBoard(nodes, edges || [], cfg, {
        instruction: typeof instruction === "string" ? instruction : undefined,
        style: typeof style === "string" ? style : undefined,
        mode: mode === "subset" ? "subset" : "board",
        subsetLabel: typeof subsetLabel === "string" ? subsetLabel : undefined,
      });
      res.json({ summary });
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      console.error("AI Summarize error:", msg);
      res.status(502).json({ error: msg });
    }
  });

  // ---- AI Chat (SSE streaming) ----
  // 把看板节点/连线序列化为上下文附加到 system 指令，让 AI 能"理解"当前画布。
  const buildCanvasContext = (sys: string, ctx: { pageName?: string; nodes?: unknown[]; edges?: unknown[] } | undefined): string => {
    if (!ctx || !Array.isArray(ctx.nodes) || ctx.nodes.length === 0) return sys;
    const nodesText = ctx.nodes
      .slice(0, 80)
      .map((n: any) => {
        let t = '';
        if (n.type === 'table' && Array.isArray(n.tableData) && n.tableData.length > 0) {
          t = n.tableData
            .slice(0, 10)
            .map((row: any[]) => row.map((c: any) => String(c?.text ?? '')).join(' | '))
            .join('\n')
            .slice(0, 600);
        } else if (n.type === 'chart' && n.chartConfig) {
          const pts = (n.chartConfig.data || [])
            .slice(0, 15)
            .map((d: any) => `${d.label}:${d.value}`)
            .join(', ');
          t = `[${n.chartConfig.chartType || 'chart'}] ${n.chartConfig.title || ''} | ${pts}`;
        } else {
          t = (typeof n.content === 'string' ? n.content : '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200);
        }
        const tagText = Array.isArray(n.tags) && n.tags.length ? `[标签:${n.tags.slice(0, 5).join(',')}] ` : '';
        return `- [${n.type || 'text'}] (id=${n.id}) ${tagText}${t}`;
      })
      .join('\n');
    const edgeText = (Array.isArray(ctx.edges) ? ctx.edges : [])
      .slice(0, 100)
      .map((e: any) => `${e.source} → ${e.target}`)
      .join('\n');
    return `${sys}\n\n当前看板「${ctx.pageName || '未命名'}」的内容：\n${nodesText}\n\n节点之间的连接：\n${edgeText || '（无）'}\n说明：你可以参考上面的看板内容回答问题，但不要编造看板中不存在的内容。`;
  };

  app.post("/api/llm/chat", async (req, res) => {
    try {
      const cfg = loadLlmConfig();
      if (!cfg?.apiKey || !cfg.model || !cfg.baseUrl) {
        return res.status(400).json({ error: "请先在设置中配置 LLM（Base URL / 模型 / API Key）" });
      }
      const { messages, context } = req.body || {};
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Invalid messages" });
      }
      const system = buildCanvasContext(
        "你是一个嵌入无限画布应用的 AI 助手。用简洁、友好的中文回答用户关于画布与节点内容的提问，也可帮用户梳理、扩展、总结思路。",
        typeof context === "object" ? context : undefined,
      );
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const full = [{ role: "system", content: system }, ...messages];
      await streamLlm(cfg, full as any, (delta) => {
        res.write(`data: ${JSON.stringify({ delta, done: false })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      if (!res.headersSent) {
        res.status(502).json({ error: msg });
      } else {
        res.write(`data: ${JSON.stringify({ error: msg, done: true })}\n\n`);
        res.end();
      }
    }
  });

  // ---- AI Edge Relations (propose relationship labels for edges) ----
  app.post("/api/llm/edge-relations", async (req, res) => {
    try {
      const cfg = loadLlmConfig();
      if (!cfg?.apiKey || !cfg.model || !cfg.baseUrl) {
        return res.status(400).json({ error: "请先在设置中配置 LLM" });
      }
      const { nodes, edges } = req.body || {};
      if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return res.status(400).json({ error: "Invalid nodes or edges data" });
      }
      const result = await llmProposeEdgeRelations(cfg, nodes, edges);
      res.json(result);
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      res.status(502).json({ error: msg });
    }
  });

  // ---- AI Associate (node similarity suggestions) ----
  app.post("/api/llm/associate", async (req, res) => {
    try {
      const cfg = loadLlmConfig();
      if (!cfg?.apiKey || !cfg.model || !cfg.baseUrl) {
        return res.status(400).json({ error: "请先在设置中配置 LLM" });
      }
      const { nodeId, nodes, limit } = req.body || {};
      if (!nodeId || !Array.isArray(nodes)) {
        return res.status(400).json({ error: "Invalid nodes data" });
      }
      const result = await associateNodes(cfg, nodes, nodeId, limit || 5);
      res.json(result);
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      res.status(502).json({ error: msg });
    }
  });

  // ---- AI Chart (analyze table data → chart config) ----
  app.post("/api/llm/chart", async (req, res) => {
    try {
      const cfg = loadLlmConfig();
      if (!cfg?.apiKey || !cfg.model || !cfg.baseUrl) {
        return res.status(400).json({ error: "请先在设置中配置 LLM（Base URL / 模型 / API Key）" });
      }
      const { rows, instruction } = req.body || {};
      if (!Array.isArray(rows) || rows.length < 2) {
        return res.status(400).json({ error: "表格数据至少需要两行（表头 + 数据）" });
      }
      // 只接受字符串二维数组，防止恶意 payload
      const clean: string[][] = rows
        .slice(0, 100)
        .map((r) =>
          Array.isArray(r)
            ? r.slice(0, 30).map((c) => String(c ?? "").slice(0, 200))
            : []
        )
        .filter((r) => r.length > 0);
      const result = await analyzeChart(
        cfg,
        clean,
        typeof instruction === "string" ? instruction.slice(0, 500) : undefined,
      );
      res.json(result);
    } catch (error) {
      const msg = error instanceof LlmError ? error.message : (error as Error).message;
      console.error("AI Chart error:", msg);
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
