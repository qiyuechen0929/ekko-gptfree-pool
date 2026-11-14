/**
 * ChatGPT 智能轮换 management page — three-tab layout (批量导入 / 我的账轮换池 / 额度统计). All operations via plugin RPC.
 */
export async function mount(element, ctx) {
  const style = document.createElement("style");
  style.textContent = `
    .gfp {
      --gfp-accent: var(--accent, #2f6feb);
      --gfp-line: var(--border, rgba(127,127,127,.22));
      --gfp-soft: var(--bg-soft, rgba(127,127,127,.07));
      --gfp-green: #1a9a55; --gfp-amber: #c98a04; --gfp-red: #d4544c;
      --gfp-mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
      font-family: inherit; max-width: 1060px; margin: 0 auto;
      padding: 32px 24px 64px; color: var(--fg, inherit);
      -webkit-font-smoothing: antialiased;
    }
    .gfp * { box-sizing: border-box; }
    .gfp ::selection { background: color-mix(in srgb, var(--gfp-accent) 22%, transparent); }
    .gfp .eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 10.5px; font-weight: 700; letter-spacing: .18em;
      color: var(--gfp-accent); margin-bottom: 10px;
    }
    .gfp .eyebrow::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--gfp-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--gfp-accent) 18%, transparent); }
    .gfp h1 { font-size: 23px; font-weight: 750; letter-spacing: -.015em; margin: 0 0 10px; }
    .gfp p.sub { margin: 0 0 26px; max-width: 62ch; opacity: .62; font-size: 13px; line-height: 1.8; }

    /* ---- tabs: segmented control ---- */
    .gfp .tabs {
      display: inline-flex; gap: 4px; padding: 4px; border-radius: 12px;
      background: var(--gfp-soft); margin-bottom: 26px;
    }
    .gfp .tabs button {
      appearance: none; background: transparent; border: none; border-radius: 9px;
      padding: 7px 18px; font-size: 13px; font-weight: 600; color: inherit;
      opacity: .6; cursor: pointer; transition: opacity .15s, background .15s, box-shadow .15s;
    }
    .gfp .tabs button:hover { opacity: .9; }
    .gfp .tabs button.active {
      opacity: 1; background: var(--bg, #fff);
      box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 0 0 1px var(--gfp-line);
    }
    .gfp .tabs .count-chip {
      display: inline-block; min-width: 18px; margin-left: 6px; padding: 0 6px;
      border-radius: 99px; background: color-mix(in srgb, var(--gfp-accent) 14%, transparent);
      color: var(--gfp-accent); font-size: 11px; font-weight: 700; line-height: 18px;
      font-variant-numeric: tabular-nums; text-align: center;
    }

    /* ---- pages & cards ---- */
    .gfp .page { animation: gfp-in .18s ease-out; }
    @keyframes gfp-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    .gfp .card {
      border: 1px solid var(--gfp-line); border-radius: 14px; padding: 22px;
      margin-bottom: 16px; background: var(--bg, transparent);
      box-shadow: 0 1px 2px rgba(0,0,0,.04);
    }
    .gfp h2 { font-size: 14.5px; font-weight: 700; letter-spacing: -.01em; margin: 0; }
    .gfp .num {
      display: inline-flex; width: 22px; height: 22px; border-radius: 7px;
      background: var(--gfp-accent); color: #fff; font-size: 12px; font-weight: 700;
      align-items: center; justify-content: center; margin-right: 10px; vertical-align: -5px;
    }
    .gfp .headline {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--gfp-line);
    }
    .gfp .headline .meta { font-size: 11.5px; opacity: .5; letter-spacing: .02em; }

    /* ---- guide timeline ---- */
    .gfp .steps { display: flex; flex-direction: column; margin: 0 2px; }
    .gfp .steps .step {
      position: relative; display: flex; gap: 14px; padding: 0 0 18px 0;
      font-size: 13px; line-height: 1.75;
    }
    .gfp .steps .step::before {
      content: ""; position: absolute; left: 11px; top: 24px; bottom: 2px;
      width: 1px; background: var(--gfp-line);
    }
    .gfp .steps .step:last-child { padding-bottom: 0; }
    .gfp .steps .step:last-child::before { display: none; }
    .gfp .steps .no {
      position: relative; z-index: 1; flex: 0 0 23px; height: 23px; border-radius: 50%;
      background: var(--bg, #fff); border: 1.5px solid var(--gfp-accent);
      color: var(--gfp-accent); font-size: 11.5px; font-weight: 700;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .gfp .steps b { font-weight: 650; }
    .gfp .steps a {
      color: var(--gfp-accent); font-weight: 650; text-decoration: none;
      border-bottom: 1px solid color-mix(in srgb, var(--gfp-accent) 35%, transparent);
      transition: border-color .15s;
    }
    .gfp .steps a:hover { border-bottom-color: var(--gfp-accent); }
    .gfp .buyurl {
      cursor: pointer; color: var(--gfp-accent); padding: 2px 9px;
      background: color-mix(in srgb, var(--gfp-accent) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--gfp-accent) 30%, transparent);
      transition: background .15s;
    }
    .gfp .buyurl:hover { background: color-mix(in srgb, var(--gfp-accent) 16%, transparent); }

    /* ---- format spec ---- */
    .gfp .fmt { border: 1px solid var(--gfp-line); background: var(--gfp-soft); border-radius: 12px; padding: 16px 18px; margin-bottom: 18px; }
    .gfp .fmt h3 { font-size: 12.5px; font-weight: 650; margin: 0 0 4px; opacity: .85; }
    .gfp .fmt .fmt-row { display: flex; gap: 12px; align-items: baseline; padding: 8px 0; flex-wrap: wrap; }
    .gfp .fmt .fmt-row + .fmt-row { border-top: 1px dashed var(--gfp-line); }
    .gfp .fmt .chip {
      flex: 0 0 auto; font-size: 11px; font-weight: 700; letter-spacing: .01em;
      color: var(--gfp-accent); border: 1px solid color-mix(in srgb, var(--gfp-accent) 35%, transparent);
      border-radius: 6px; padding: 2px 9px; white-space: nowrap;
    }
    .gfp .fmt code { font-family: var(--gfp-mono); font-size: 11.5px; background: var(--bg, rgba(127,127,127,.09)); border-radius: 5px; padding: 3px 9px; word-break: break-all; }
    .gfp .fmt .note { opacity: .55; font-size: 12px; }

    /* ---- inputs ---- */
    .gfp textarea {
      width: 100%; min-height: 168px; font-family: var(--gfp-mono); font-size: 12.5px;
      line-height: 1.75; padding: 14px; border-radius: 11px;
      border: 1px solid var(--gfp-line); background: var(--bg, transparent); color: inherit;
      resize: vertical; transition: border-color .15s, box-shadow .15s;
    }
    .gfp textarea:focus, .gfp input[type=text]:focus {
      outline: none; border-color: var(--gfp-accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--gfp-accent) 14%, transparent);
    }
    .gfp input[type=text] {
      padding: 9px 13px; border-radius: 9px; border: 1px solid var(--gfp-line);
      background: var(--bg, transparent); color: inherit; font-size: 13px;
      transition: border-color .15s, box-shadow .15s;
    }
    .gfp .count { font-size: 11.5px; opacity: .5; text-align: right; margin-top: 6px; font-variant-numeric: tabular-nums; }

    .gfp .row { display: flex; gap: 10px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
    .gfp .row.spread { justify-content: space-between; }
    .gfp button {
      appearance: none; padding: 8px 18px; border-radius: 9px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--gfp-line); background: transparent; color: inherit; cursor: pointer;
      transition: transform .12s, box-shadow .12s, border-color .12s, background .12s;
    }
    .gfp button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.08); }
    .gfp button:active:not(:disabled) { transform: none; box-shadow: none; }
    .gfp button.primary {
      background: var(--gfp-accent); border-color: transparent; color: #fff;
      box-shadow: 0 1px 3px color-mix(in srgb, var(--gfp-accent) 40%, transparent);
    }
    .gfp button.danger { color: var(--gfp-red); }
    .gfp button:disabled { opacity: .45; cursor: not-allowed; }
    .gfp label { font-size: 13px; line-height: 1.5; }
    .gfp input[type=checkbox] { accent-color: var(--gfp-accent); margin-right: 2px; }
    .gfp .hint { font-size: 12px; opacity: .55; margin-top: 8px; line-height: 1.75; }
    .gfp .hint code { font-family: var(--gfp-mono); font-size: 11px; background: var(--gfp-soft); border-radius: 4px; padding: 1px 6px; }

    .gfp .filebox {
      border: 1.5px dashed var(--gfp-line); border-radius: 12px; padding: 16px 18px;
      margin-bottom: 14px; transition: border-color .15s, background .15s;
    }
    .gfp .filebox.drag {
      border-color: var(--gfp-accent);
      background: color-mix(in srgb, var(--gfp-accent) 6%, transparent);
    }
    .gfp .filebox-inner { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .gfp .filebox-inner b { font-size: 13px; font-weight: 650; }
    .gfp .filebox-inner .note { font-size: 12px; opacity: .55; }
    .gfp .filebtn {
      margin-left: auto; padding: 7px 16px; border-radius: 9px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--gfp-line); background: var(--bg, transparent); color: inherit;
      cursor: pointer; transition: transform .12s, box-shadow .12s; white-space: nowrap;
    }
    .gfp .filebtn:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.08); }

    /* ---- preview & log ---- */
    .gfp .preview { margin-top: 14px; font-size: 12.5px; }
    .gfp .preview .ok { color: var(--gfp-green); }
    .gfp .preview .bad { color: var(--gfp-red); }
    .gfp .log {
      margin-top: 16px; max-height: 320px; overflow: auto;
      border: 1px solid var(--gfp-line); border-radius: 12px;
      background: var(--bg, transparent);
    }
    .gfp .logsum {
      position: sticky; top: 0; z-index: 1;
      display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
      padding: 10px 16px; font-size: 12px; font-weight: 650;
      border-bottom: 1px solid var(--gfp-line);
      background: var(--bg, #fff);
    }
    .gfp .logsum .pill {
      display: inline-flex; align-items: center; gap: 6px;
      font-variant-numeric: tabular-nums;
    }
    .gfp .logsum .pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .gfp .logsum .pill.ok { color: var(--gfp-green); }
    .gfp .logsum .pill.fail { color: var(--gfp-red); }
    .gfp .logsum .pill.wait { color: var(--gfp-amber); }
    .gfp .logsum .pill.plain::before { display: none; }
    .gfp .logrow {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 10px 16px; border-bottom: 1px dashed var(--gfp-line);
    }
    .gfp .logrow:last-child { border-bottom: none; }
    .gfp .logrow .dot { flex: 0 0 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: var(--gfp-line); }
    .gfp .logrow.ok .dot { background: var(--gfp-green); }
    .gfp .logrow.fail .dot { background: var(--gfp-red); }
    .gfp .logrow.wait .dot { background: var(--gfp-amber); animation: gfp-pulse 1.2s ease-in-out infinite; }
    @keyframes gfp-pulse { 50% { opacity: .35; } }
    .gfp .logrow .what { flex: 1; min-width: 0; }
    .gfp .logrow .who { font-size: 13px; font-weight: 600; }
    .gfp .logrow .who .line-no { font-size: 11px; font-weight: 600; opacity: .45; font-variant-numeric: tabular-nums; margin-right: 6px; }
    .gfp .logrow .state { font-size: 12px; margin-top: 3px; opacity: .7; line-height: 1.6; }
    .gfp .logrow.fail .state { color: var(--gfp-red); opacity: 1; }
    .gfp .logrow.ok .state { color: var(--gfp-green); opacity: 1; }
    .gfp .logrow .when { flex: 0 0 auto; font-size: 11px; opacity: .4; font-variant-numeric: tabular-nums; margin-top: 2px; }
    .gfp .logend {
      padding: 14px 16px; font-size: 13px; font-weight: 650;
      border-top: 1px solid var(--gfp-line);
    }
    .gfp .logend .fail-detail { margin-top: 8px; font-size: 12px; font-weight: 500; color: var(--gfp-red); opacity: .9; line-height: 1.7; }
    .gfp .log::-webkit-scrollbar, .gfp .logtable::-webkit-scrollbar { width: 8px; height: 8px; }
    .gfp .log::-webkit-scrollbar-thumb { background: var(--gfp-line); border-radius: 99px; }

    /* ---- tables ---- */
    .gfp table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .gfp th {
      text-align: left; padding: 8px 10px; font-size: 10.5px; font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase; opacity: .45;
      border-bottom: 1px solid var(--gfp-line);
    }
    .gfp td { text-align: left; padding: 11px 10px; border-bottom: 1px solid var(--gfp-line); white-space: nowrap; }
    .gfp tbody tr { transition: background .12s; }
    .gfp tbody tr:hover { background: var(--gfp-soft); }
    .gfp tbody tr:last-child td { border-bottom: none; }

    /* ---- status dots ---- */
    .gfp .tag { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
    .gfp .tag::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
    .gfp .tag.green { color: var(--gfp-green); }
    .gfp .tag.amber { color: var(--gfp-amber); }
    .gfp .tag.red { color: var(--gfp-red); }
    .gfp .tag.blue { color: var(--gfp-accent); font-size: 11px; font-weight: 700; letter-spacing: .04em; }
    .gfp .tag.blue::before { display: none; }
    .gfp .tag.blue { border: 1px solid color-mix(in srgb, var(--gfp-accent) 35%, transparent); border-radius: 5px; padding: 1px 7px; }
    .gfp .quota-pill {
      display: inline-block; min-width: 46px; text-align: center; padding: 3px 13px;
      border-radius: 99px; font-family: var(--gfp-mono); font-size: 12.5px; font-weight: 700;
      background: color-mix(in srgb, var(--gfp-green) 12%, transparent); color: var(--gfp-green);
      font-variant-numeric: tabular-nums;
    }

    /* ---- stat cards ---- */
    .gfp .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 22px; }
    .gfp .stat {
      border: 1px solid var(--gfp-line); border-radius: 14px; padding: 16px 18px;
      background: var(--bg, transparent); transition: transform .15s, box-shadow .15s;
    }
    .gfp .stat:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.07); }
    .gfp .stat .label { font-size: 12px; opacity: .65; margin-bottom: 10px; }
    .gfp .stat .value {
      font-size: 30px; font-weight: 800; letter-spacing: -.02em;
      font-variant-numeric: tabular-nums; line-height: 1;
    }
    .gfp .stat .desc { font-size: 11px; opacity: .5; margin-top: 8px; line-height: 1.5; }
    .gfp .stat.good .value { color: var(--gfp-green); }
    .gfp .stat.warn .value { color: var(--gfp-amber); }
    .gfp .stat.bad .value { color: var(--gfp-red); }
    .gfp .summary-line { font-size: 13px; opacity: .85; margin-bottom: 14px; }
    .gfp .summary-line b { color: var(--gfp-accent); font-variant-numeric: tabular-nums; }
    .gfp .foot { text-align: center; font-size: 11px; opacity: .4; margin-top: 36px; letter-spacing: .03em; }
    .gfp .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--gfp-line); }
    .gfp .repoline {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 13px; margin-bottom: 10px;
    }
    .gfp .star-mark { color: #eac54f; font-size: 15px; }
    .gfp .meta-line { font-size: 11px; opacity: .45; line-height: 1.8; }
  `;
  const root = document.createElement("div");
  root.className = "gfp";
  const shadow = element.shadowRoot || element;
  (shadow || element).append(style, root);

  const state = { tab: "import", accounts: [], quota: null, poll: null, importing: false };

  root.innerHTML = `
    <div class="eyebrow">GPT ACCOUNT POOL · EKKO STUDIO</div>
    <h1>ChatGPT 智能轮换</h1>
    <p class="sub">把一批 ChatGPT 账号变成会自动轮询、自动换号、自动重登的轮换池。所有凭证仅在本机加密处理，界面只显示打码邮箱；请遵守上游使用规则与账号授权范围。</p>

    <div class="tabs">
      <button data-tab="import">批量导入</button>
      <button data-tab="pool">我的账轮换池 <span class="count-chip" id="gfp-tab-count" style="display:none"></span></button>
      <button data-tab="quota">额度统计</button>
      <button data-tab="usage">调用指南</button>
    </div>

    <!-- ============================== 批量导入 ============================== -->
    <div id="gfp-page-import" class="page">
      <div class="card">
        <div class="steps">
          <div class="step"><span class="no">1</span><span>买号：到 <b>priceai.cc</b> 购买 GPT 普号（约三毛钱 10 个，自带生图额度），网址：<code class="buyurl" data-external="https://priceai.cc/">https://priceai.cc/</code>（点击复制），在订单页复制提取文本。</span></div>
          <div class="step"><span class="no">2</span><span>导入：把文本粘贴到下面输入框 → 点「检查账号格式」→ 勾选授权确认 → 点「导入并授权入池」。登录全自动，不弹网页。</span></div>
          <div class="step"><span class="no">3</span><span>开用：切到上方「<b>调用指南</b>」标签页，按方式一在聊天里选 Agent + 模型即可对话；API / 工作流等更多调用方式也在那一页。</span></div>
        </div>
      </div>

      <div class="card">
        <div class="headline"><h2><span class="num">1</span>批量导入账号</h2><span class="meta">单批最多 100 条 · 可多次追加，累计支持 1000 个账号轮询</span></div>

        <div class="fmt">
          <h3>支持导入的账号格式规范（每行一条，分隔符兼容 ---- 或 ---）：</h3>
          <div class="fmt-row"><span class="chip">格式 1 标准三字段</span><code>邮箱----密码----2FA密钥</code><span class="note">（最常用，自动后台 HTTP OAuth + TOTP 换取 Token 入池）</span></div>
          <div class="fmt-row"><span class="chip">格式 2 带邮箱链接</span><code>邮箱----密码----2FA密钥----https://mail.xxx.store/...</code><span class="note">（自动识别前三项登录，不主动请求链接）</span></div>
          <div class="fmt-row"><span class="chip">格式 3/4 带 Token</span><code>邮箱----密码----2FA密钥----eyJhbGci...</code><span class="note">（Token 有效则复用，过期自动重登；也兼容 5 段结尾附 refresh_token）</span></div>
          <div class="fmt-row"><span class="chip">无 2FA</span><code>邮箱----密码</code><span class="note">（能用，但平台额外验证时可能失败）</span></div>
        </div>

        <div class="filebox" id="gfp-filebox">
          <div class="filebox-inner">
            <b>选择或拖入 .txt 账号文件</b><span class="note">（加载后可在下方直接编辑，改完再导入）</span>
            <label class="filebtn" for="gfp-file">选择 TXT 文件</label>
            <input type="file" id="gfp-file" accept=".txt,text/plain" hidden>
          </div>
        </div>

        <textarea id="gfp-text" placeholder="user1@example.com————password————BASE32TOTPSECRET
user2@example.com————password————BASE32TOTPSECRET————https://mail.xxx.store/...
user3@example.com————password————BASE32TOTPSECRET————eyJhbGci...
user4@example.com————password————BASE32TOTPSECRET————eyJhbGci...————rt_refresh_token"></textarea>
        <div class="count" id="gfp-line-count">0 行有效文本</div>

        <div class="row spread">
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button id="gfp-check">检查账号格式</button>
            <button id="gfp-clear">清空输入</button>
          </div>
          <label style="font-size:13px"><input type="checkbox" id="gfp-skip"> 跳过格式错误行，仅导入有效账号</label>
        </div>

        <div class="row" style="margin-top:16px;align-items:center;gap:14px">
          <span style="font-size:13px;font-weight:600;white-space:nowrap">HTTP(S) 代理（可选）</span>
          <input type="text" id="gfp-proxy" placeholder="例如 http://127.0.0.1:7890（留空自动使用插件配置）" style="flex:1;min-width:220px">
        </div>
        <label style="font-size:13px;display:block;margin-top:12px"><input type="checkbox" id="gfp-consent"> 我确认这些账号由本人持有或已获授权管理。</label>
        <div class="row">
          <button id="gfp-import" class="primary">导入并授权入池</button>
          <button id="gfp-cancel" class="danger" style="display:none">停止导入</button>
          <span class="hint" style="margin:0">勾选授权确认后即可批量入池；格式不对的行可以先改好再导入。</span>
        </div>

        <div class="preview" id="gfp-preview"></div>
        <div class="log" id="gfp-log" style="display:none"></div>
        <div class="hint">首次导入会自动准备 Python 运行环境（隔离 venv，不改动系统 Python）；密码、2FA 密钥、Token 只加密存在本机，绝不写入日志或网页。</div>
      </div>
    </div>

    <!-- ============================== 我的账轮换池 ============================== -->
    <div id="gfp-page-pool" class="page" style="display:none">
      <div class="card">
        <div class="headline"><h2><span class="num">2</span>我的多账轮换池</h2>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button id="gfp-refresh">刷新列表</button>
            <button id="gfp-relogin-all">全部重新登录</button>
          </div>
        </div>
        <div class="summary-line" id="gfp-pool-summary"></div>
        <table><thead><tr><th>账号</th><th>2FA</th><th>Token 状态</th><th>更新时间</th><th style="text-align:right">操作</th></tr></thead>
        <tbody id="gfp-rows"></tbody></table>
        <div class="hint">fresh=Token 可用；stale=待自动重登（对话时会自动处理）；expired=已过期。轮换池模型在聊天中选择 Agent「ChatGPT 智能轮换」的模型即可使用。</div>
      </div>
    </div>

    <!-- ============================== 额度统计 ============================== -->
    <div id="gfp-page-quota" class="page" style="display:none">
      <div class="card">
        <div class="headline"><h2><span class="num">3</span>生图额度统计</h2>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button id="gfp-quota-refresh-all" class="primary">刷新全部额度</button>
            <button id="gfp-quota-refresh">重新读取</button>
          </div>
        </div>
        <p class="hint" style="margin:0 0 14px">实时读取轮换池各账号在 ChatGPT Web 端的生图剩余额度及本机调用统计；未检测或查询失败时如实展示状态，绝不伪造数值。</p>
        <div class="summary-line" id="gfp-quota-summary"></div>
        <div class="cards" id="gfp-quota-cards"></div>
        <table><thead><tr><th>账号</th><th>类型</th><th>状态</th><th>剩余生图额度</th><th>成功 / 失败</th><th>最近检测</th><th style="text-align:right">操作</th></tr></thead>
        <tbody id="gfp-quota-rows"></tbody></table>
      </div>

      <div class="card">
        <div class="headline"><h2><span class="num">4</span>最近调用记录</h2><span class="meta">最近 100 条 · 生图 / 对话 / 额度刷新</span></div>
        <table><thead><tr><th>时间</th><th>类型</th><th>账号</th><th>结果</th><th>说明</th></tr></thead>
        <tbody id="gfp-calllog-rows"></tbody></table>
        <div class="hint">对话调用走轮换池自动轮询，账号列显示"自动轮询"表示由轮换池内部选号；生图记录的账号为实际使用的账号。</div>
      </div>
    </div>

    <!-- ============================== 调用指南 ============================== -->
    <div id="gfp-page-usage" class="page" style="display:none">
      <div class="card">
        <div class="headline"><h2><span class="num">A</span>方式一 · 聊天调用（最常用）</h2><span class="meta">单聊 / 群聊均支持</span></div>
        <div class="steps">
          <div class="step"><span class="no">1</span><span>新建一个<b>单聊会话</b>（或打开已有会话）。</span></div>
          <div class="step"><span class="no">2</span><span>在输入框附近的 <b>Agent 选择器</b>里选「<b>ChatGPT 智能轮换</b>」。</span></div>
          <div class="step"><span class="no">3</span><span>在模型下拉里选轮换池模型：<code>gpt-5.6-luna</code>（默认）、<code>gpt-6-luna</code>、<code>gpt-5.6-terra</code>（支持推理档位）、<code>gpt-6-mini</code> 等，共 10 个。</span></div>
          <div class="step"><span class="no">4</span><span>直接发消息即可。回复为流式输出；上下文由会话自动维护，多轮对话无需额外操作。</span></div>
        </div>
        <div class="hint">推理模型（terra / Thinking Mini 系列）可在模型设置里选 推理档位 low / medium / high；上下文窗口 128K，单次输出上限 16K。</div>
      </div>

      <div class="card">
        <div class="headline"><h2><span class="num">B</span>方式二 · 群聊调用</h2><span class="meta">多人群聊里当助手</span></div>
        <div class="steps">
          <div class="step"><span class="no">1</span><span>打开（或新建）群聊 → 群聊设置里<b>添加成员 / Agent</b>。</span></div>
          <div class="step"><span class="no">2</span><span>选择「<b>ChatGPT 智能轮换</b>」，保存后群内 <b>@ 它</b>即可触发回复，走同一套轮换池轮询。</span></div>
        </div>
        <div class="hint">群聊中每个 @ 是一次独立调用，共用轮换池的限流冷却与故障转移。</div>
      </div>

      <div class="card">
        <div class="headline"><h2><span class="num">C</span>方式三 · 工作流调用</h2><span class="meta">自动化批量任务</span></div>
        <div class="steps">
          <div class="step"><span class="no">1</span><span>在 Studio 的<b>工作流</b>编辑器里添加「Agent 运行」类节点。</span></div>
          <div class="step"><span class="no">2</span><span>节点的 Agent 选「<b>ChatGPT 智能轮换</b>」，模型任选轮换池模型；节点任务和上游输出会作为本轮输入传入。</span></div>
          <div class="step"><span class="no">3</span><span>运行工作流即可批量调用；配合循环节点可实现逐条处理，配合定时调度可周期执行。</span></div>
        </div>
        <div class="hint">工作流复用现有节点的重试、分支与取消机制；单次节点运行上限一小时。</div>
      </div>

      <div class="card">
        <div class="headline"><h2><span class="num">D</span>方式四 · HTTP API 调用（外部程序）</h2><span class="meta">需要 Studio 的登录凭证</span></div>
        <p class="hint" style="margin:0 0 12px">Ekko Studio 的后端是标准 JSON API，外部脚本可以用登录后的凭证直接驱动轮换池 Agent。整条链路是：<b>创建会话（指定 Agent）→ 发送输入 → 读历史拿回复</b>。</p>
        <div class="fmt">
          <h3>1. 创建一个绑定轮换池 Agent 的会话：</h3>
          <div class="fmt-row"><code>POST /api/studio/sessions&#10;{ "title": "轮换池测试", "agent": "plugin:pool/pool" }</code></div>
          <h3 style="margin-top:12px">2. 向会话发送输入（返回后轮询/订阅运行状态）：</h3>
          <div class="fmt-row"><code>POST /api/studio/sessions/&lt;会话ID&gt;/run&#10;{ "input": "你好，介绍一下你自己" }</code></div>
          <h3 style="margin-top:12px">3. 读取会话历史获取回复：</h3>
          <div class="fmt-row"><code>GET /api/studio/sessions/&lt;会话ID&gt;/messages</code></div>
        </div>
        <div class="hint">curl 示例（把 &lt;TOKEN&gt;、&lt;地址&gt; 换成你的 Studio 地址和登录凭证）：<code>curl -X POST "http://&lt;地址&gt;/api/studio/sessions" -H "Authorization: Bearer &lt;TOKEN&gt;" -H "Content-Type: application/json" -d '{"title":"轮换池测试","agent":"plugin:pool/pool"}'</code></div>
        <div class="hint">模型与推理档位可在会话上通过 setModel 接口指定；凭证请勿写入公开脚本。</div>
      </div>

      <div class="card">
        <div class="headline"><h2><span class="num">E</span>方式五 · 跨 Agent 工具调用（Pi 等其他 Agent）</h2><span class="meta">轮换池作为 MCP 工具，任何 Agent 都能用</span></div>
        <div class="steps">
          <div class="step"><span class="no">1</span><span>插件启用后，以下 3 个工具自动注册到 Studio 的共享 MCP（<code>ekko-studio-plugins</code>），<b>Ekko、Hermes、Pi、Coding Agent 全部可用</b>，不要求会话绑定轮换池 Agent：</span></div>
          <div class="step"><span class="no">·</span><span><code>pool__pool_status</code> — 查询轮换池账号数 / 可用数 / 打码列表</span></div>
          <div class="step"><span class="no">·</span><span><code>pool__pool_chat</code> — 用轮换池完成一次单轮对话（参数：message，可选 model）</span></div>
          <div class="step"><span class="no">·</span><span><code>pool__generate_image</code> — 生图并返回本地文件路径（参数：prompt，可选 size / model / background）</span></div>
          <div class="step"><span class="no">2</span><span>在任何 Agent 的聊天里直接说人话即可，比如「<b>/pool:image 一只戴墨镜的橘猫</b>」或自然语言「<b>帮我用轮换池生成一张雪山日出图标</b>」，AI 会自动调用对应工具。</span></div>
          <div class="step"><span class="no">3</span><span>生出的图片保存在本机插件数据目录的 images 文件夹里，AI 会把文件路径回复给你。</span></div>
        </div>
        <div class="hint">如果 Agent 的工具列表里没看到这些工具：刷新 MCP 管理页，或让 Agent 新开一轮运行（工具目录在轮次开始时加载）。命令完整格式：<code>/pool:image &lt;画面描述&gt;</code>。</div>
      </div>

      <div class="card">
        <div class="headline"><h2><span class="num">!</span>常见问题</h2></div>
        <table><tbody>
          <tr><td class="wrap" style="width:38%"><b>模型列表为空 / 选不到轮换池模型</b></td><td class="wrap">轮换池里没有可用账号（或全部 Token 过期）。回「批量导入」加号，或在「我的账轮换池」对失败账号点「检测/刷新」。</td></tr>
          <tr><td class="wrap"><b>导入时报 authorize_failed_403</b></td><td class="wrap">当前出口 IP 被 Cloudflare 拦截。在导入页的代理框（或插件中心的本插件配置）填一个能正常访问 ChatGPT 的 HTTP(S) 代理。</td></tr>
          <tr><td class="wrap"><b>对话时报 429 限流</b></td><td class="wrap">免费号有速率限制。轮换池会自动冷却该账号并切换下一个；持续 429 说明所有账号都被限流，导入更多账号或稍后再试。</td></tr>
          <tr><td class="wrap"><b>对话中途报 Token 失效</b></td><td class="wrap">轮换池会自动重新登录该账号并重试；不需要手动处理。若长期失败，在「我的账轮换池」点「检测/刷新」。</td></tr>
          <tr><td class="wrap"><b>想换更聪明的回答</b></td><td class="wrap">选 terra 或 Thinking Mini 系列，并把推理档位调到 high；代价是更慢、更耗额度。</td></tr>
        </tbody></table>
      </div>
    </div>

    <div class="footer">
      <div class="repoline">
        <span class="star-mark">★</span> 觉得好用的话，欢迎给项目点个 Star：
        <code class="buyurl" data-external="https://github.com/qiyuechen0929/ekko-gptfree-pool">github.com/qiyuechen0929/ekko-gptfree-pool</code>（点击复制）
      </div>
      <div class="meta-line">ChatGPT 智能轮换 v<span id="gfp-version"></span> · 所有凭证仅在本机处理，请遵守上游使用规则与账号授权范围 · 更新请在插件中心查看</div>
    </div>
  `;

  const $ = (id) => root.querySelector(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const call = (name, input) => ctx.rpc.call(name, input);
  const proxyInput = () => $("#gfp-proxy").value.trim();

  // The plugin iframe's CSP blocks external navigation, so outbound links
  // copy the URL to the clipboard and ask the user to open it in a browser.
  root.addEventListener("click", async (ev) => {
    const link = ev.target?.closest?.("[data-external]");
    if (!link) return;
    ev.preventDefault();
    const url = link.dataset.external;
    try {
      await navigator.clipboard.writeText(url);
      ctx.ui?.notify?.({ type: "success", message: `链接已复制：${url}（请粘贴到浏览器打开）` });
    } catch {
      ctx.ui?.notify?.({ type: "info", message: `请手动打开：${url}` });
    }
  });

  // ------------------------------------------------------------ tabs
  function showTab(tab) {
    state.tab = tab;
    for (const b of root.querySelectorAll(".tabs button")) {
      b.classList.toggle("active", b.dataset.tab === tab);
    }
    $("#gfp-page-import").style.display = tab === "import" ? "" : "none";
    $("#gfp-page-pool").style.display = tab === "pool" ? "" : "none";
    $("#gfp-page-quota").style.display = tab === "quota" ? "" : "none";
    $("#gfp-page-usage").style.display = tab === "usage" ? "" : "none";
    if (tab === "pool") refreshAccounts();
    if (tab === "quota") refreshQuota();
  }
  root.querySelector(".tabs").addEventListener("click", (ev) => {
    const tab = ev.target?.dataset?.tab;
    if (tab) showTab(tab);
  });

  // ------------------------------------------------------------ helpers
  const tokenTag = (stateName) => {
    const s = String(stateName || "unknown");
    if (s === "unexpired_unverified") return `<span class="tag green">Token 有效（待请求确认）</span>`;
    if (s === "expired") return `<span class="tag red">已过期</span>`;
    if (s === "unknown") return `<span class="tag amber">未知</span>`;
    return `<span class="tag amber">stale 待重登</span>`;
  };
  const fmtTime = (iso) => esc(String(iso || "").replace("T", " ").slice(0, 19));

  function updateTabCount() {
    const chip = $("#gfp-tab-count");
    if (state.accounts.length) {
      chip.textContent = String(state.accounts.length);
      chip.style.display = "";
    } else {
      chip.style.display = "none";
    }
  }

  // ------------------------------------------------------------ import tab
  function countValidLines() {
    const lines = $("#gfp-text").value.split(/\r?\n/)
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("----") || (l && l.includes("---")));
    $("#gfp-line-count").textContent = `${lines.length} 行有效文本`;
    return lines.length;
  }

  async function checkFormat() {
    const preview = $("#gfp-preview");
    preview.innerHTML = "检查中…";
    try {
      const res = await call("check-format", { text: $("#gfp-text").value });
      const rows = (res.valid || []).map((v) =>
        `<div class="ok">✔ 第 ${v.line} 行 ${esc(v.email)}${v.has2FA ? " [2FA]" : ""} [${esc(v.kind)}]${v.tokenState ? ` [Token:${esc(v.tokenState)}]` : ""}</div>`).join("");
      const bad = (res.invalid || []).map((v) =>
        `<div class="bad">✘ 第 ${v.line} 行：${esc(v.reason)}</div>`).join("");
      const dupCount = Number(res.duplicates) || 0;
      const dup = dupCount ? `<div class="bad">重复行 ${dupCount} 条已忽略</div>` : "";
      preview.innerHTML = `<div style="margin-bottom:6px;font-weight:700">有效 <span class="ok">${res.total}</span> 条，格式错误 <span class="bad">${(res.invalid || []).length}</span> 条${dupCount ? `，重复 ${dupCount} 条` : ""}</div>${rows}${bad}${dup}`;
    } catch (err) {
      preview.innerHTML = `<div class="bad">${esc(err?.message || err)}</div>`;
    }
  }

  const STATE_TEXT = {
    authorizing: "正在后台授权登录（HTTP OAuth + TOTP）…",
    added: "授权成功，已入池",
    token_reused: "Token 有效，直接复用入池",
    token_expired: "自带 Token 已过期，将重新登录",
    token_needs_oauth: "自带 Token 不可用，将重新登录",
    mail_link_ignored: "已识别邮箱链接（仅作标记，不会访问该链接）",
    failed: "授权失败",
  };

  function renderStatus(status) {
    const log = $("#gfp-log");
    log.style.display = "";
    const events = status.events || [];
    const seen = new Map();
    for (const e of events) {
      if (e.email) seen.set(e.email, e);
    }
    const okCount = [...seen.values()].filter((e) => e.state === "added" || e.state === "token_reused").length;
    const failCount = [...seen.values()].filter((e) => e.state === "failed").length;
    const waitCount = [...seen.values()].filter((e) => e.state === "authorizing").length;

    let html = `<div class="logsum">
      <span class="pill plain">导入进度</span>
      <span class="pill ok">成功 ${okCount}</span>
      <span class="pill fail">失败 ${failCount}</span>
      ${status.running ? `<span class="pill wait">处理中 ${waitCount}</span>` : ""}
      ${status.running ? `<span style="margin-left:auto;font-weight:500;opacity:.55">任务运行中，请勿关闭页面</span>` : ""}
    </div>`;

    for (const e of events) {
      const cls = e.state === "added" || e.state === "token_reused" ? "ok"
        : e.state === "failed" ? "fail" : "wait";
      const who = e.email ? `<span class="who"><span class="line-no">${e.line ? `第 ${e.line} 行` : ""}</span>${esc(e.email)}</span>` : "";
      const state = `<div class="state">${esc(STATE_TEXT[e.state] || e.state)}${e.reason ? `：${esc(e.reason)}` : ""}</div>`;
      html += `<div class="logrow ${cls}">
        <span class="dot"></span>
        <div class="what">${who}${who ? state : `<div class="state">${esc(STATE_TEXT[e.state] || e.state)}</div>`}</div>
        <span class="when">${esc(String(e.at || "").slice(11, 19))}</span>
      </div>`;
    }

    if (status.error) {
      html += `<div class="logend" style="color:var(--gfp-red)">任务失败：${esc(status.error)}</div>`;
    }
    if (status.result) {
      const r = status.result;
      html += `<div class="logend">导入完成：共 ${r.total} 条，成功入池 ${r.added}，复用 Token ${r.reused}，授权失败 ${(r.failed || []).length}，格式错误行 ${(r.invalid || []).length}`;
      for (const f of (r.failed || []).slice(0, 50)) {
        html += `<div class="fail-detail">第 ${f.line} 行 ${esc(f.email)}：${esc(f.reason)}</div>`;
      }
      for (const v of (r.invalid || []).slice(0, 20)) {
        html += `<div class="fail-detail">第 ${v.line} 行：格式错误（${esc(v.reason)}），已跳过</div>`;
      }
      html += `</div>`;
    }
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
  }

  function setImporting(v) {
    state.importing = v;
    $("#gfp-import").disabled = v;
    $("#gfp-check").disabled = v;
    $("#gfp-cancel").style.display = v ? "" : "none";
  }

  async function pollStatus() {
    try {
      const status = await call("get-import-status");
      renderStatus(status);
      if (status.noJob && $("#gfp-log").innerHTML === "") {
        $("#gfp-log").innerHTML = `<div class="logend" style="color:var(--gfp-amber)">没有正在进行的导入任务。提示：导入进度保存在内存里，若 Studio 刚重载或重启，上一次的进度不会保留（已入池的账号不受影响，可在「我的账轮换池」查看）。</div>`;
      }
      if (!status.running) {
        setImporting(false);
        clearInterval(state.poll);
        state.poll = null;
        if (status.result || status.error) {
          ctx.ui?.notify?.(status.error
            ? { type: "error", message: `导入失败：${status.error}` }
            : { type: "success", message: `导入完成：成功 ${status.result.added} 个，失败 ${(status.result.failed || []).length} 个` });
        }
      }
    } catch { /* transient poll errors are ignored */ }
  }

  $("#gfp-text").addEventListener("input", countValidLines);

  // ---- TXT file loading: picker + drag-drop, content fills the textarea ----
  function loadFile(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      ctx.ui?.notify?.({ type: "error", message: "文件超过 1 MiB，请分批导入" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      $("#gfp-text").value = String(reader.result || "");
      countValidLines();
      $("#gfp-preview").innerHTML = "";
      ctx.ui?.notify?.({ type: "success", message: `已加载 ${file.name}` });
    };
    reader.onerror = () => ctx.ui?.notify?.({ type: "error", message: `读取 ${file.name} 失败` });
    reader.readAsText(file, "utf-8");
  }

  $("#gfp-file").addEventListener("change", (ev) => {
    loadFile(ev.target?.files?.[0]);
    ev.target.value = "";
  });

  const filebox = $("#gfp-filebox");
  filebox.addEventListener("dragover", (ev) => { ev.preventDefault(); filebox.classList.add("drag"); });
  filebox.addEventListener("dragleave", () => filebox.classList.remove("drag"));
  filebox.addEventListener("drop", (ev) => {
    ev.preventDefault();
    filebox.classList.remove("drag");
    loadFile(ev.dataTransfer?.files?.[0]);
  });
  $("#gfp-check").addEventListener("click", checkFormat);
  $("#gfp-clear").addEventListener("click", () => {
    $("#gfp-text").value = "";
    $("#gfp-preview").innerHTML = "";
    $("#gfp-log").style.display = "none";
    countValidLines();
  });

  $("#gfp-import").addEventListener("click", async () => {
    const text = $("#gfp-text").value;
    if (!text.trim()) { ctx.ui?.notify?.({ type: "error", message: "请先粘贴账号文本" }); return; }
    if (!$("#gfp-consent").checked) {
      ctx.ui?.notify?.({ type: "error", message: "请先勾选「我确认这些账号由本人持有或已获授权管理」" });
      return;
    }
    try {
      await call("import-accounts", { text, skipInvalid: $("#gfp-skip").checked, proxy: proxyInput() });
      setImporting(true);
      $("#gfp-preview").innerHTML = "";
      $("#gfp-log").innerHTML = "";
      $("#gfp-log").style.display = "";
      if (!state.poll) state.poll = setInterval(pollStatus, 2000);
      pollStatus();
    } catch (err) {
      ctx.ui?.notify?.({ type: "error", message: String(err?.message || err) });
    }
  });

  $("#gfp-cancel").addEventListener("click", async () => {
    try { await call("cancel-import"); } catch {}
    pollStatus();
  });

  // ------------------------------------------------------------ pool tab
  async function refreshAccounts() {
    try {
      const { accounts } = await call("list-accounts");
      state.accounts = accounts || [];
      updateTabCount();
      const fresh = state.accounts.filter((a) => a.tokenState === "unexpired_unverified").length;
      const stale = state.accounts.length - fresh;
      $("#gfp-pool-summary").innerHTML =
        `共 <b>${state.accounts.length}</b> 个入池账号 · 有效 <b>${fresh}</b> · 待重登/异常 <b>${stale}</b>`;
      $("#gfp-rows").innerHTML = state.accounts.length
        ? state.accounts.map((a) => `
          <tr>
            <td><b>${esc(a.email)}</b></td>
            <td>${a.has2FA ? "✔" : "—"}</td>
            <td>${tokenTag(a.tokenState)}</td>
            <td>${fmtTime(a.updatedAt)}</td>
            <td style="text-align:right">
              <button data-relogin="${esc(a.email)}">检测/刷新</button>
              <button data-remove="${esc(a.email)}" class="danger">移除</button>
            </td>
          </tr>`).join("")
        : `<tr><td colspan="5" style="opacity:.6">轮换池为空：切到「批量导入」标签页，按三步指引导入账号。</td></tr>`;
    } catch (err) {
      $("#gfp-rows").innerHTML = `<tr><td colspan="5" class="bad">读取失败：${esc(err?.message || err)}</td></tr>`;
    }
  }

  $("#gfp-refresh").addEventListener("click", refreshAccounts);

  $("#gfp-relogin-all").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    try {
      await call("relogin-all");
      ctx.ui?.notify?.({ type: "success", message: "已重新登录全部账号" });
      refreshAccounts();
    } catch (err) {
      ctx.ui?.notify?.({ type: "error", message: String(err?.message || err) });
    } finally { ev.target.disabled = false; }
  });

  $("#gfp-rows").addEventListener("click", async (ev) => {
    const relogin = ev.target?.dataset?.relogin;
    const remove = ev.target?.dataset?.remove;
    if (relogin) {
      ev.target.disabled = true;
      try { await call("relogin-account", { email: relogin }); refreshAccounts(); }
      catch (err) { ctx.ui?.notify?.({ type: "error", message: String(err?.message || err) }); }
      finally { ev.target.disabled = false; }
    } else if (remove) {
      const ok = await ctx.ui?.confirm?.({ title: "移除账号", message: `确定从轮换池移除 ${remove} 吗？` });
      if (ok === false) return;
      try { await call("remove-account", { email: remove }); refreshAccounts(); }
      catch (err) { ctx.ui?.notify?.({ type: "error", message: String(err?.message || err) }); }
    }
  });

  // ------------------------------------------------------------ quota tab
  async function refreshQuota() {
    try {
      const data = await call("quota-list");
      state.quota = data;
      const s = data.summary || {};
      $("#gfp-quota-summary").innerHTML =
        `共 <b>${s.total ?? 0}</b> 个账号 · 可用 <b>${s.usable ?? 0}</b> · 限流 <b>${s.limited ?? 0}</b> · 待检测 <b>${s.pending ?? 0}</b>`;
      const cards = [
        ["当前账号", s.total ?? 0, "轮换池中已入池账号数", ""],
        ["可用账号", s.usable ?? 0, "Token 有效且有剩余生图额度", "good"],
        ["限流账号", s.limited ?? 0, "剩余额度为 0 或触发限流", "warn"],
        ["剩余额度", s.quotaSum ?? 0, "可用账号生图剩余额度之和", "good"],
        ["成功调用", data.totals?.successCalls ?? 0, "本机累计生图成功次数", ""],
        ["失败调用", data.totals?.failCalls ?? 0, "本机累计生图失败次数", "bad"],
      ];
      $("#gfp-quota-cards").innerHTML = cards.map(([label, value, desc, cls]) =>
        `<div class="stat ${cls}"><div class="label">${label}</div><div class="value">${value}</div><div class="desc">${desc}</div></div>`).join("");
      const TYPE_LABEL = { image: "生图", chat: "对话", probe: "额度刷新" };
      $("#gfp-calllog-rows").innerHTML = (data.callLog || []).length
        ? (data.callLog || []).map((e) => `
          <tr>
            <td>${fmtTime(e.at)}</td>
            <td><span class="tag blue">${TYPE_LABEL[e.type] || esc(e.type || "调用")}</span></td>
            <td>${e.email ? esc(e.email) : `<span style="opacity:.55">自动轮询</span>`}</td>
            <td>${e.ok ? `<span class="tag green">成功</span>` : `<span class="tag red">失败</span>`}</td>
            <td class="wrap">${esc(e.detail || "")}</td>
          </tr>`).join("")
        : `<tr><td colspan="5" style="opacity:.55">还没有调用记录；生图、轮换池对话、刷新额度都会记在这里。</td></tr>`;

      $("#gfp-quota-rows").innerHTML = (data.accounts || []).length
        ? (data.accounts || []).map((a) => {
            const quota = a.imageQuota === null || a.imageQuota === undefined
              ? `<span style="opacity:.5">待检测</span>`
              : `<span class="quota-pill">${a.imageQuota}</span>`;
            const status = a.rateLimited
              ? `<span class="tag red">限流</span>`
              : a.tokenState === "unexpired_unverified"
                ? `<span class="tag green">可用</span>`
                : `<span class="tag amber">待重登</span>`;
            return `<tr>
              <td><b>${esc(a.email)}</b></td>
              <td><span class="tag blue">${esc(a.planType || "FREE")}</span></td>
              <td>${status}</td>
              <td>${quota}</td>
              <td>${a.successCalls ?? 0} / ${a.failCalls ?? 0}</td>
              <td>${a.quotaCheckedAt ? fmtTime(a.quotaCheckedAt) : "未检测"}${a.quotaError ? `<div class="hint" style="margin:0">${esc(a.quotaError)}</div>` : ""}</td>
              <td style="text-align:right"><button data-probe="${esc(a.email)}">检测额度</button></td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="7" style="opacity:.6">轮换池为空。</td></tr>`;
    } catch (err) {
      $("#gfp-quota-rows").innerHTML = `<tr><td colspan="7" class="bad">读取失败：${esc(err?.message || err)}</td></tr>`;
    }
  }

  $("#gfp-quota-refresh").addEventListener("click", refreshQuota);
  $("#gfp-quota-refresh-all").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = "检测中…";
    try {
      await call("quota-probe-all");
      ctx.ui?.notify?.({ type: "success", message: "已刷新全部额度" });
      refreshQuota();
    } catch (err) {
      ctx.ui?.notify?.({ type: "error", message: String(err?.message || err) });
    } finally {
      ev.target.disabled = false;
      ev.target.textContent = "刷新全部额度";
    }
  });

  $("#gfp-quota-rows").addEventListener("click", async (ev) => {
    const probe = ev.target?.dataset?.probe;
    if (!probe) return;
    ev.target.disabled = true;
    ev.target.textContent = "检测中…";
    try {
      await call("quota-probe", { email: probe });
      refreshQuota();
    } catch (err) {
      ctx.ui?.notify?.({ type: "error", message: String(err?.message || err) });
      ev.target.disabled = false;
      ev.target.textContent = "检测额度";
    }
  });

  // ------------------------------------------------------------ init
  showTab("import");
  countValidLines();
  call("plugin-meta").then((m) => { $("#gfp-version").textContent = m?.version || "?"; }).catch(() => {});
  call("list-accounts").then(({ accounts }) => {
    state.accounts = accounts || [];
    updateTabCount();
  }).catch(() => {});

  return () => {
    if (state.poll) clearInterval(state.poll);
  };
}
