/**
 * Ekko Studio plugin: ChatGPT 轮换 (ChatGPT 智能轮换).
 *
 * Reuses the upstream lib/ modules as-is; only the host integration layer
 * host-specific concerns are handled here:
 *  - storage root  -> ctx.paths.dataDir (via GPTFREE_POOL_HOME)
 *  - GUI service   -> plugin RPC + page views
 *  - provider auth -> ctx.extensions.agents.register (global mode runtime)
 */
import { join } from "node:path";
import { writeFile, rm } from "node:fs/promises";

const VERSION = "0.7.0";

export function apply(ctx) {
  // lib modules resolve their data root from env at import/call time; point
  // them at the plugin's stable private data dir before any dynamic import.
  process.env.GPTFREE_POOL_HOME = ctx.paths.dataDir;
  if (ctx.config?.pythonPath) {
    process.env.GPTFREE_POOL_PYTHON = String(ctx.config.pythonPath);
  }

  const proxyOf = () => String(ctx.config?.proxy || "");
  const lib = {};
  const ready = (async () => {
    // dsh-http-auth.mjs resolves GPTFREE_POOL_HOME at import time, so all
    // lib imports must happen after the env var above is set.
    lib.credentials = await import("./lib/credentials.mjs");
    lib.vault = await import("./lib/pool-vault.mjs");
    lib.dsh = await import("./lib/dsh-http-auth.mjs");
    lib.text = await import("./lib/chatgpt-web-text.mjs");
    lib.pool = await import("./lib/codex-pool.mjs");
    lib.importer = await import("./lib/importer.mjs");
    lib.stats = await import("./lib/pool-stats.mjs");
    lib.image = await import("./lib/chatgpt-web-image.mjs");
  })().catch((err) => {
    ctx.log.error("gptfree lib 加载失败: " + String(err?.message || err));
    throw err;
  });

  // ---------------------------------------------------------------- import job
  // Batch import can take many minutes (one isolated OAuth worker per
  // account), far beyond the 120s RPC limit; run it in the background and
  // let the page poll get-import-status.
  let importJob = null; // { id, running, events, result, error, startedAt }
  let importAbort = null;

  function startImport(text, { skipInvalid, proxy }) {
    if (importJob?.running) {
      throw new Error("已有批量导入任务在进行中，请等待完成或先取消");
    }
    const job = {
      id: `imp_${Date.now()}`, running: true, events: [],
      result: null, error: null, startedAt: new Date().toISOString(),
    };
    importJob = job;
    importAbort = new AbortController();
    const onProgress = (event) => {
      job.events.push({ at: new Date().toISOString(), ...event });
      if (job.events.length > 500) job.events.splice(0, job.events.length - 500);
    };
    (async () => {
      try {
        await ready;
        const file = join(ctx.paths.dataDir, `import-${job.id}.txt`);
        await writeFile(file, text, "utf8");
        try {
          job.result = await lib.importer.runBatch({
            file,
            consent: true,
            proxy: typeof proxy === "string" ? proxy : proxyOf(),
            skipInvalid: !!skipInvalid,
            onProgress,
            signal: importAbort.signal,
            read: async () => text,
          });
        } finally {
          await rm(file, { force: true }).catch(() => {});
        }
      } catch (err) {
        job.error = String(err?.message || err);
      } finally {
        job.running = false;
      }
    })();
    return { started: true, jobId: job.id };
  }

  // ------------------------------------------------------------------- agents
  async function listAccounts() {
    await ready;
    const rows = await lib.vault.listPool();
    return rows.map((r) => ({
      email: lib.credentials.safeAccountName(r.email),
      has2FA: !!r.totp,
      tokenState: lib.credentials.accessTokenState(r.accessToken).state,
      updatedAt: r.updatedAt || "",
    }));
  }

  const registration = ctx.extensions.agents.register({
    id: "pool",
    name: "ChatGPT 智能轮换",
    vendor: "qiyuechen0929",
    description: "ChatGPT 免费账号轮换池：多账号轮询、自动重登、故障转移。",
    agentApiVersion: 1,
    async getStatus() {
      return { installed: true, version: VERSION };
    },
    management: {
      settings: () => ({ viewId: "agent-settings" }),
    },
    modes: {
      global: {
        async listModels() {
          await ready;
          const rows = await lib.vault.listPool();
          if (!rows.length) {
            return {
              status: "empty", source: "pool", scope: "builtin", models: [],
              message: "ChatGPT 智能轮换 为空：请打开 ChatGPT 轮换 页面批量导入账号后再使用。",
            };
          }
          const models = lib.text.WEB_TEXT_MODEL_SPECS.map((spec) => ({
            id: spec.id,
            name: spec.name,
            isDefault: spec.id === lib.text.DEFAULT_WEB_TEXT_MODEL,
            contextWindow: 128000,
            maxOutputTokens: 16384,
            ...(spec.reasoning ? { reasoningEfforts: ["low", "medium", "high"] } : {}),
          }));
          return { status: "ready", source: "pool", scope: "builtin", models };
        },
      },
    },
    features: { surfaces: ["chat", "group-chat", "workflow", "api"], streaming: true, resume: false },
    runtime: {
      createSession(session) {
        return {
          async run(input, run) {
            await ready;
            const rows = await lib.vault.listPool();
            if (!rows.length) {
              throw new Error("ChatGPT 轮换 没有可用账号，请先在 ChatGPT 轮换 页面批量导入。");
            }

            const messages = [];
            for (const m of input.history || []) {
              const text = (m.content || [])
                .filter((p) => p.type === "text")
                .map((p) => p.text).join("\n");
              if (text.trim()) messages.push({ role: m.role, content: text });
            }
            const turnText = (input.input || [])
              .filter((p) => p.type === "text")
              .map((p) => p.text).join("\n");
            if (turnText.trim()) messages.push({ role: "user", content: turnText });

            const instructions = (input.instructions || [])
              .map((i) => String(i.text || "")).filter(Boolean).join("\n\n");

            const model = run.model?.model || lib.text.DEFAULT_WEB_TEXT_MODEL;
            const rawBody = {
              model,
              stream: true,
              input: messages,
              ...(instructions ? { instructions } : {}),
              ...(run.model?.reasoningEffort ? { reasoning: { effort: run.model.reasoningEffort } } : {}),
            };

            const response = await lib.text.executeWebTextGeneration(rawBody, rows, {
              reauthenticate: (account) => lib.pool.renewAccount(account, { proxy: proxyOf() }),
              signal: run.signal ?? session.signal,
              proxy: proxyOf(),
            });

            const contentType = String(response.headers.get("content-type") || "");
            let finalText = "";
            if (contentType.includes("text/event-stream")) {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                  const frame = buffer.slice(0, idx);
                  buffer = buffer.slice(idx + 2);
                  const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
                  if (!dataLine) continue;
                  let payload;
                  try { payload = JSON.parse(dataLine.slice(6)); } catch { continue; }
                  if (payload?.type === "response.output_text.delta" && typeof payload.delta === "string" && payload.delta) {
                    finalText += payload.delta;
                    await run.output.emit({ type: "text.delta", text: payload.delta });
                  } else if (payload?.type === "response.completed") {
                    const completedText = payload.response?.output_text;
                    if (typeof completedText === "string" && completedText.length > finalText.length) {
                      const remainder = completedText.slice(finalText.length);
                      finalText = completedText;
                      if (remainder) await run.output.emit({ type: "text.delta", text: remainder });
                    }
                  } else if (payload?.type === "error") {
                    throw new Error(String(payload.error?.message || "轮换池上游返回错误"));
                  }
                }
              }
            } else {
              const json = await response.json();
              if (json?.error) {
                throw new Error(String(json.error.message || "轮换池上游返回错误"));
              }
              finalText = String(json?.output_text || "");
            }

            if (!finalText.trim()) {
              throw new Error("轮换池返回了空回复；请稍后重试或导入更多账号。");
            }
            await logCall({ type: "chat", email: "", ok: true,
              detail: `聊天调用（${model}，流式）` });
            return {
              content: [{ type: "text", text: finalText }],
              finishReason: "stop",
              usage: { inputTokens: null, outputTokens: null, isEstimated: true },
            };
          },
          async dispose() {},
        };
      },
    },
  });

  // --------------------------------------------------------------------- RPCs
  ctx.extensions.rpc.register("plugin-meta", async () => ({ version: VERSION }));

  ctx.extensions.rpc.register("check-format", async (input) => {
    await ready;
    const parsed = lib.credentials.parseAccounts(String(input?.text || ""));
    return {
      total: parsed.accounts.length,
      duplicates: parsed.duplicates,
      invalid: parsed.errors.slice(0, 100),
      valid: parsed.accounts.map((a) => ({
        line: a.line,
        email: lib.credentials.safeAccountName(a.email),
        has2FA: !!a.totp,
        kind: a.kind,
        tokenState: a.kind === "access_token" ? lib.credentials.accessTokenState(a.accessToken).state : undefined,
      })),
    };
  });

  ctx.extensions.rpc.register("import-accounts", async (input) => {
    const text = String(input?.text || "");
    if (!text.trim()) throw new Error("账号文本为空");
    const check = lib.credentials.validateProxyUrl(String(input?.proxy || ""));
    if (check.error) throw new Error(check.error);
    return startImport(text, { skipInvalid: !!input?.skipInvalid, proxy: check.proxy });
  });

  ctx.extensions.rpc.register("get-import-status", async () => {
    if (!importJob) return { running: false, jobId: null, noJob: true, events: [], result: null, error: null };
    return {
      running: importJob.running, jobId: importJob.id,
      startedAt: importJob.startedAt, events: importJob.events,
      result: importJob.result, error: importJob.error,
    };
  });

  ctx.extensions.rpc.register("cancel-import", async () => {
    if (importJob?.running && importAbort) {
      importAbort.abort();
      return { cancelled: true };
    }
    return { cancelled: false };
  });

  ctx.extensions.rpc.register("list-accounts", async () => {
    return { accounts: await listAccounts() };
  });

  ctx.extensions.rpc.register("remove-account", async (input) => {
    await ready;
    const rows = await lib.vault.listPool();
    const target = String(input?.email || "");
    // The page only ever holds masked emails; resolve by masked name.
    const hit = rows.find((r) => lib.credentials.safeAccountName(r.email) === target);
    if (!hit) throw new Error("未找到该账号");
    const res = await lib.vault.removePool(hit.email);
    return { removed: res.removed, total: res.total };
  });

  ctx.extensions.rpc.register("relogin-account", async (input) => {
    await ready;
    const rows = await lib.vault.listPool();
    const target = String(input?.email || "");
    const hit = rows.find((r) => lib.credentials.safeAccountName(r.email) === target);
    if (!hit) throw new Error("未找到该账号");
    const renewed = await lib.pool.renewAccount(hit, { proxy: proxyOf() });
    return { ok: true, tokenState: lib.credentials.accessTokenState(renewed.accessToken).state };
  });

  // ---------------------------------------------------------------- quota RPCs
  ctx.extensions.rpc.register("quota-list", async () => {
    await ready;
    const rows = await lib.vault.listPool();
    const { accountSlotTag } = await import("./lib/pool-connection.mjs");
    const stats = await lib.stats.readPoolStats();
    const accounts = rows.map((r) => {
      const tag = accountSlotTag(r.email);
      const entry = tag ? stats.accounts[tag] : null;
      return {
        email: lib.credentials.safeAccountName(r.email),
        tokenState: lib.credentials.accessTokenState(r.accessToken).state,
        planType: entry?.planType || "FREE",
        imageQuota: entry?.imageQuota ?? null,
        restoreAt: entry?.restoreAt || null,
        successCalls: entry?.successCalls ?? 0,
        failCalls: entry?.failCalls ?? 0,
        quotaCheckedAt: entry?.quotaCheckedAt || null,
        quotaError: entry?.quotaError || null,
        rateLimited: Boolean(entry?.limitedUntil && Date.parse(entry.limitedUntil) > Date.now()),
      };
    });
    const usable = accounts.filter((a) => a.tokenState === "unexpired_unverified" && !a.rateLimited && (a.imageQuota === null || a.imageQuota > 0));
    return {
      totals: stats.totals,
      summary: {
        total: accounts.length,
        usable: usable.length,
        limited: accounts.filter((a) => a.rateLimited).length,
        quotaSum: usable.reduce((sum, a) => sum + (a.imageQuota || 0), 0),
        pending: accounts.filter((a) => a.quotaCheckedAt === null).length,
      },
      accounts,
      callLog: await (async () => { await loadCallLog; return callLog.slice(0, 100); })(),
    };
  });

  ctx.extensions.rpc.register("quota-probe", async (input) => {
    await ready;
    const rows = await lib.vault.listPool();
    const target = String(input?.email || "");
    const hit = rows.find((r) => lib.credentials.safeAccountName(r.email) === target);
    if (!hit) throw new Error("未找到该账号");
    const res = await lib.pool.probeAccountImageQuota(hit, {
      proxy: String(input?.proxy || "") || proxyOf(),
      reauthenticate: (account) => lib.pool.renewAccount(account, { proxy: proxyOf() }),
    });
    return {
      ok: Boolean(res.ok),
      email: target,
      imageQuota: res.imageQuota ?? null,
      restoreAt: res.restoreAt || null,
      rateLimited: Boolean(res.rateLimited),
      planType: res.planType || null,
      error: res.error || null,
    };
  });

  ctx.extensions.rpc.register("quota-probe-all", async (_input, run) => {
    await ready;
    const rows = await lib.vault.listPool();
    const results = new Array(rows.length);
    let cursor = 0;
    async function worker() {
      for (;;) {
        if (run.signal?.aborted) return;
        const i = cursor++;
        if (i >= rows.length) return;
        const account = rows[i];
        try {
          const res = await lib.pool.probeAccountImageQuota(account, {
            proxy: proxyOf(),
            reauthenticate: (acc) => lib.pool.renewAccount(acc, { proxy: proxyOf() }),
          });
          results[i] = {
            email: lib.credentials.safeAccountName(account.email),
            ok: Boolean(res.ok),
            imageQuota: res.imageQuota ?? null,
            error: res.error || null,
          };
        } catch (err) {
          results[i] = {
            email: lib.credentials.safeAccountName(account.email), ok: false,
            error: String(err?.message || err).slice(0, 180),
          };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
    await logCall({ type: "probe", email: "", ok: true, detail: `刷新全部额度（${rows.length} 个账号）` });
    return { results: results.filter(Boolean) };
  });

  ctx.extensions.rpc.register("relogin-all", async (_input, run) => {
    await ready;
    const rows = await lib.vault.listPool();
    const results = [];
    for (const account of rows) {
      if (run.signal?.aborted) break;
      try {
        const renewed = await lib.pool.renewAccount(account, { proxy: proxyOf() });
        results.push({
          email: lib.credentials.safeAccountName(account.email), ok: true,
          tokenState: lib.credentials.accessTokenState(renewed.accessToken).state,
        });
      } catch (err) {
        results.push({
          email: lib.credentials.safeAccountName(account.email), ok: false,
          error: String(err?.message || err).slice(0, 180),
        });
      }
    }
    return { results };
  });

  ctx.log.info(`ChatGPT 轮换 (Ekko) v${VERSION} 已加载；数据目录 ${ctx.paths.dataDir}`);

  // ---------------------------------------------------------------- MCP tools
  // Exposed in the shared ekko-studio-plugins MCP so ANY agent (Ekko, Hermes,
  // Pi, Coding Agent...) can call the pool, not just sessions bound to the
  // plugin Agent runtime. Tool ids: pool__<name>.
  function toolAccounts() {
    return lib.vault.listPool();
  }

  // Every image attempt (success or failure) feeds the quota-stats ledger,
  // mirroring the upstream GUI wiring so 额度统计 stays live.
  async function saveGeneratedImages(res) {
    const dir = join(ctx.paths.dataDir, "images");
    await (await import("node:fs/promises")).mkdir(dir, { recursive: true });
    const saved = [];
    for (const item of res?.data || []) {
      const b64 = item.b64 || item.b64_json || item.base64 || "";
      if (!b64) continue;
      const ext = (item.mime_type || "image/png").split("/")[1] || "png";
      const path = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
      await (await import("node:fs/promises")).writeFile(path, Buffer.from(b64, "base64"));
      saved.push(path);
    }
    return saved;
  }

  // Rolling call log (last 200 entries), persisted in plugin storage.
  let callLog = null;
  const loadCallLog = (async () => {
    try {
      callLog = (await ctx.state.plugin.get("call-log")) || [];
      if (!Array.isArray(callLog)) callLog = [];
    } catch { callLog = []; }
  })();
  async function logCall(entry) {
    try {
      await loadCallLog;
      callLog.unshift({
        at: new Date().toISOString(),
        ...entry,
      });
      if (callLog.length > 200) callLog.length = 200;
      await ctx.state.plugin.set("call-log", callLog);
    } catch {}
  }

  async function recordImageResult(payload) {
    if (!lib.stats) return;
    try {
      await lib.stats.recordImageCall({
        email: String(payload?.account?.email || ""),
        success: Boolean(payload?.success),
        count: Number(payload?.count) || 1,
        rateLimited: Boolean(payload?.rateLimited),
        retryAfter: payload?.retryAfter ?? null,
        error: String(payload?.errorCode || payload?.error || ""),
      });
      await logCall({
        type: "image",
        email: lib.credentials?.safeAccountName(payload?.account?.email || "") || "",
        ok: Boolean(payload?.success),
        detail: payload?.success
          ? `生图成功（第 ${payload?.count || 1} 张）`
          : `生图失败（${payload?.errorCode || payload?.error || "未知原因"}）`,
      });
    } catch {}
  }

  ctx.extensions.tools.register({
    name: "pool_status",
    description: "当用户问轮换池状态、还有几个号、可不可用、能不能生图时调用本工具。查看 ChatGPT 智能轮换 状态：账号数、可用数、生图剩余额度。无参数。",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    async execute() {
      await ready;
      const rows = await toolAccounts();
      const fresh = rows.filter((a) => lib.credentials.accessTokenState(a.accessToken).state === "unexpired_unverified");
      const masked = rows.map((r) => lib.credentials.safeAccountName(r.email));
      if (!rows.length) return { ok: true, content: "轮换池为空：请先在 ChatGPT 轮换 页面导入账号。", data: { total: 0, usable: 0 } };
      return {
        ok: true,
        content: `轮换池共 ${rows.length} 个账号，其中 ${fresh.length} 个 Token 有效。账号列表：${masked.join("、")}`,
        data: { total: rows.length, usable: fresh.length },
      };
    },
  });

  ctx.extensions.tools.register({
    name: "pool_chat",
    description: "当用户要求用轮换池问答、免费 GPT 回答、轮换池聊天时调用本工具。用 ChatGPT 智能轮换 的免费 ChatGPT 账轮换池完成一次对话（非流式，单轮）。参数：message 必填；model 可选（默认 gpt-5.6-luna）。",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "要发送给模型的消息内容", maxLength: 32000 },
        model: { type: "string", description: "轮换池文本模型 id，如 gpt-5.6-luna / gpt-6 / gpt-5-6-t-mini", maxLength: 64 },
      },
      required: ["message"],
    },
    async execute({ message, model }) {
      await ready;
      const accounts = await toolAccounts();
      if (!accounts.length) return { ok: false, content: "轮换池为空：请先在 ChatGPT 轮换 页面导入账号。" };
      const rawBody = {
        model: String(model || lib.text.DEFAULT_WEB_TEXT_MODEL),
        stream: false,
        input: [{ role: "user", content: String(message || "") }],
      };
      const response = await lib.text.executeWebTextGeneration(rawBody, accounts, {
        reauthenticate: (account) => lib.pool.renewAccount(account, { proxy: proxyOf() }),
        signal: undefined,
        proxy: proxyOf(),
      });
      const json = await response.json();
      if (json?.error) {
        await logCall({ type: "chat", email: "", ok: false, detail: `轮换池对话失败：${String(json.error.message || "").slice(0, 120)}` });
        return { ok: false, content: `轮换池上游错误：${String(json.error.message || "")}` };
      }
      const reply = String(json?.output_text || "");
      if (!reply.trim()) return { ok: false, content: "轮换池返回了空回复，请稍后重试。" };
      await logCall({ type: "chat", email: "", ok: true, detail: `轮换池对话完成（${String(model || lib.text.DEFAULT_WEB_TEXT_MODEL)}）` });
      return { ok: true, content: reply };
    },
  });

  ctx.extensions.tools.register({
    name: "generate_image",
    description: "当用户要求生成图片、画图、画一张、画个、生成插画/图标/头像/表情包、文生图，或提到用轮换池/轮换池生图时调用本工具。用 ChatGPT 智能轮换 的 ChatGPT 免费账号生图（gpt-image-2 / 2.6 系列，2.6 系列可生成 GIF）。参数：prompt 必填；size/model/background 可选。返回本地图片文件路径。",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "画面描述", maxLength: 4000 },
        size: { type: "string", description: "尺寸，如 1024x1024；留空自动", maxLength: 20 },
        model: { type: "string", description: "生图模型 id，默认 gpt-image-2；2.6 系列支持 GIF", maxLength: 64 },
        background: { type: "string", description: "auto / transparent / opaque", maxLength: 20 },
      },
      required: ["prompt"],
    },
    async execute({ prompt, size, model, background }, run) {
      await ready;
      const accounts = await toolAccounts();
      if (!accounts.length) return { ok: false, content: "轮换池为空：请先在 ChatGPT 轮换 页面导入账号。" };
      const modelId = lib.image.isImageModelId(String(model || "")) ? String(model) : lib.image.IMAGE_MODEL_ID;
      const res = await lib.image.executeWebImageGeneration({
        accounts,
        request: {
          prompt: String(prompt || ""),
          model: modelId,
          size: String(size || ""),
          background: String(background || "auto"),
        },
        reauthenticate: (account) => lib.pool.renewAccount(account, { proxy: proxyOf() }),
        signal: run?.signal,
        proxy: proxyOf(),
        maxTotalMs: 110_000,
        onAccountResult: recordImageResult,
      });
      const saved = await saveGeneratedImages(res);
      if (!saved.length) return { ok: false, content: "生图失败：上游未返回图片，请稍后重试或换模型。" };
      return {
        ok: true,
        content: `生图成功（模型 ${modelId}），已保存到：${saved.join("、")}`,
        data: { files: saved, model: modelId },
      };
    },
  });

  // ------------------------------------------------------- chat commands
  ctx.extensions.commands.register({
    name: "image",
    description: "用 ChatGPT 智能轮换 生图：/pool:image <画面描述>",
    async execute(args, run) {
      const prompt = String(args || "").trim();
      if (!prompt) return "用法：/pool:image <画面描述>";
      await ready;
      const accounts = await toolAccounts();
      if (!accounts.length) return "轮换池为空：请先在 ChatGPT 轮换 页面导入账号。";
      const resImg = await lib.image.executeWebImageGeneration({
        accounts,
        request: { prompt, model: lib.image.IMAGE_MODEL_ID, background: "auto" },
        reauthenticate: (account) => lib.pool.renewAccount(account, { proxy: proxyOf() }),
        signal: run?.signal,
        proxy: proxyOf(),
        maxTotalMs: 110_000,
        onAccountResult: recordImageResult,
      });
      const saved = await saveGeneratedImages(resImg);
      return saved.length ? `生图完成（${lib.image.IMAGE_MODEL_ID}）：\n${saved.join("\n")}` : "生图失败：上游未返回图片，请稍后重试。";
    },
  });

  return () => {
    importAbort?.abort();
    registration.dispose();
  };
}
