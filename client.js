/* 无限五代 (dsh-armor-gen5) client half — sidebar panel + control console + input badge.
 *
 * Registers:
 *   1. sidebar.panellist — sidebar icon/entry for the armor panel
 *   2. main — armor panel page with rich control console
 *   3. conversation.input.dock — realtime "破甲已开启" badge
 *
 * Armor panel console features:
 *   - Armor status (pass/refusal/partial/running) from "armor" projection
 *   - W5 re-anchor counter + trigger
 *   - T4 evidence chain status
 *   - session projection status (from gen5_verify tool)
 *   - gen5_verify self-check results
 *   - Normalization stats (entities rewritten)
 */
window.__ModuleLoader__.load({
  id: "dsh-armor-gen5",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");

    // cordis client 侧:访问 ctx.locale 必须在 inject 里声明,否则抛
    // "cannot get property \"locale\" without inject" 并让整个 client 半体激活失败。
    var inject = ["slots", "locale"];

    var ANIM_CSS =
      "@keyframes dshArmorPulse{0%,100%{box-shadow:0 0 2px rgba(34,197,94,.5);opacity:1}50%{box-shadow:0 0 12px rgba(34,197,94,1);opacity:.55}}@keyframes dshArmorFlash{0%{transform:scale(1)}30%{transform:scale(1.12)}100%{transform:scale(1)}}";

    var PLUGIN_VERSION = "0.2.2";
    var BADGE_TEXT = "无限五代 破甲 v" + PLUGIN_VERSION;
    var BADGE_LABEL = "无限五代 破甲";
    var PANEL_ID = "armor-gen5";
    // 侧栏 / 面板显示名。必须是常量字符串：宿主 resolveSlotLabel(label) 会直接
    // 调用 thunk，而 locale.bind(ns) 返回的翻译函数需要 key，裸调用得到 undefined，
    // 宿主就回落到 slot id（armor-gen5）。所以这里不再经过 locale。
    var PANEL_LABEL = "无限五代";
    var FLASH_MS = 2500;

    var WRAP_STYLE = { display: "flex", justifyContent: "center", width: "100%" };
    var BADGE_STYLE = {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      width: "fit-content",
      padding: "3px 10px",
      borderRadius: "6px",
      border: "1px solid rgba(34, 197, 94, 0.4)",
      background: "rgba(34, 197, 94, 0.1)",
      color: "inherit",
      fontSize: "11px",
      lineHeight: "16px",
      fontFamily: "inherit",
      userSelect: "none",
      whiteSpace: "nowrap"
    };
    var DOT_STYLE = { width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", flex: "none" };

    // ---- HTTP 帮助函数（gen-4 同源约定：GET 查询 / POST 切换）----

    var POLL_MS = 3000;
    var SCOPE_PATH = "/gen5/scope";
    var VERIFY_PATH = "/gen5/verify";
    var DISSOLVE_PATH = "/gen5/dissolve";
    var ENGAGE_PATH = "/gen5/engage";

    function fetchJSON(path, opts, done) {
      try {
        fetch(path, opts)
          .then(function (res) { return res.json(); })
          .then(function (data) { done(data || null); })
          .catch(function () { done(null); });
      } catch {
        done(null);
      }
    }

    function readScope(done) {
      fetchJSON(SCOPE_PATH, { method: "GET", headers: { "content-type": "application/json" } }, done);
    }

    function writeScope(next, done) {
      fetchJSON(SCOPE_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: next })
      }, done);
    }

    function readVerify(done) {
      fetchJSON(VERIFY_PATH, { method: "GET" }, done);
    }

    // 带超时 + HTTP 状态的回调式请求：用来区分"接口不存在 / 超时 / 业务失败"。
    // 旧版 fetchJSON 把 404 的 HTML 当 JSON 解析失败后直接 done(null)，
    // 界面只能停在"读取中…"，看不出到底是宿主没重启还是逻辑报错。
    function requestJSON(path, opts, done) {
      var finished = false;
      var timer = null;
      var finish = function (result) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        done(result);
      };
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var options = Object.assign({}, opts || {});
      if (controller) options.signal = controller.signal;
      timer = setTimeout(function () {
        try {
          if (controller) controller.abort();
        } catch {
          // ignore
        }
        finish({ ok: false, status: 0, data: null, error: "timeout" });
      }, 8000);
      try {
        fetch(path, options)
          .then(function (res) {
            return res.text().then(function (text) {
              var data = null;
              try {
                data = text ? JSON.parse(text) : null;
              } catch {
                data = null;
              }
              finish({
                ok: res.ok && data !== null,
                status: res.status,
                data: data,
                error: res.ok ? (data === null ? "bad-json" : null) : "http-" + res.status
              });
            });
          })
          .catch(function (err) {
            finish({ ok: false, status: 0, data: null, error: String((err && err.message) || err) });
          });
      } catch (error) {
        finish({ ok: false, status: 0, data: null, error: String((error && error.message) || error) });
      }
    }

    function readDissolve(done) {
      requestJSON(DISSOLVE_PATH, { method: "GET" }, done);
    }

    function engageInject(target, done) {
      requestJSON(ENGAGE_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: target })
      }, done);
    }

    // ============ Armor Console Page ============
    // Rich control console displayed when the armor panel is selected.

    var CONSOLE_CSS = ".gen5-console{display:flex;flex-direction:column;gap:14px;padding:16px;font-size:13px;color:inherit;height:100%;overflow-y:auto;box-sizing:border-box;width:100%}"+
    ".gen5-header{display:flex;flex-direction:column;gap:2px;padding-bottom:12px;border-bottom:1px solid rgba(128,128,128,0.2)}"+
    ".gen5-headerTop{display:flex;align-items:center;justify-content:space-between}"+
    ".gen5-title{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;letter-spacing:0.02em}"+
    ".gen5-titleDot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex:none;box-shadow:0 0 6px rgba(34,197,94,0.6)}"+
    ".gen5-version{font-size:11px;font-weight:500;opacity:0.55;font-variant-numeric:tabular-nums}"+
    ".gen5-section{border:1px solid rgba(128,128,128,0.18);border-radius:10px;padding:12px 14px;background:rgba(128,128,128,0.04)}"+
    ".gen5-section+.gen5-section{margin-top:0}"+
    ".gen5-sectionTitle{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;opacity:0.55;margin-bottom:10px}"+
    ".gen5-row{display:flex;align-items:center;justify-content:space-between;padding:5px 0;font-size:13px}"+
    ".gen5-row+.gen5-row{border-top:1px solid rgba(128,128,128,0.12);padding-top:5px}"+
    ".gen5-label{opacity:0.65}"+
    ".gen5-value{font-weight:500}"+
    ".gen5-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500}"+
    ".gen5-badgePass{background:rgba(34,197,94,0.15);color:#22c55e}"+
    ".gen5-badgeFail{background:rgba(239,68,68,0.15);color:#ef4444}"+
    ".gen5-badgeWarn{background:rgba(234,179,8,0.15);color:#eab308}"+
    ".gen5-badgeNeutral{background:rgba(128,128,128,0.15);color:inherit}"+
    ".gen5-verdictRefusal{background:rgba(239,68,68,0.15);color:#ef4444}"+
    ".gen5-verdictFallback{background:rgba(234,179,8,0.15);color:#eab308}"+
    ".gen5-verdictPartial{background:rgba(234,179,8,0.15);color:#eab308}"+
    ".gen5-verdictPass{background:rgba(34,197,94,0.15);color:#22c55e}"+
    ".gen5-verdictRunning{background:rgba(34,197,94,0.15);color:#22c55e}"+
    ".gen5-check{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:3px 0;font-size:12px;font-variant-numeric:tabular-nums}"+
    ".gen5-checkName{display:inline-flex;align-items:center;gap:6px;font-family:monospace;font-size:11.5px}"+
    ".gen5-checkPass{color:#22c55e}"+
    ".gen5-checkFail{color:#ef4444}"+
    ".gen5-checkDetail{opacity:0.5;font-size:11px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%}"+
    ".gen5-word{display:inline-block;padding:1px 6px;margin:2px;border-radius:3px;background:rgba(239,68,68,0.1);color:#ef4444;font-size:11px}"+
    ".gen5-btn{-webkit-appearance:none;appearance:none;border:none;border-radius:8px;padding:8px 16px;font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer;transition:opacity .15s,transform .05s;flex:1}"+
    ".gen5-btn:active{transform:scale(0.98)}"+
    ".gen5-btnOn{background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.35)}"+
    ".gen5-btnOff{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.35)}"+
    ".gen5-btnDisabled{opacity:0.5;cursor:wait}"+
    ".gen5-btnRow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}"+
    ".gen5-flow{display:flex;flex-direction:column;gap:7px;margin-top:12px}"+
    ".gen5-step{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.35}"+
    ".gen5-stepDot{width:15px;height:15px;border-radius:50%;flex:none;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;border:1px solid rgba(128,128,128,0.35);box-sizing:border-box}"+
    ".gen5-stepPending{opacity:0.3}"+
    ".gen5-stepRunning{border-color:rgba(34,197,94,0.85);box-shadow:0 0 8px rgba(34,197,94,0.55)}"+
    ".gen5-stepDone{background:rgba(34,197,94,0.9);color:#04140a;border-color:transparent}"+
    ".gen5-stepFailed{background:rgba(239,68,68,0.9);color:#fff;border-color:transparent}"+
    ".gen5-stepBody{display:flex;flex-direction:column;gap:1px;min-width:0}"+
    ".gen5-stepName{font-weight:500}"+
    ".gen5-stepDetail{opacity:0.55;font-size:11px;word-break:break-word}"+
    ".gen5-banner{margin-top:10px;padding:8px 10px;border-radius:8px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px}"+
    ".gen5-bannerOk{background:rgba(34,197,94,0.14);color:#22c55e;border:1px solid rgba(34,197,94,0.4)}"+
    ".gen5-bannerFail{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.4)}"+
    ".gen5-scanHint{font-size:11px;opacity:0.55;margin-top:4px}"+
    ".gen5-scopeTips{display:flex;flex-direction:column;gap:6px;margin-top:10px}"+
    ".gen5-scopeTip{display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.45}"+
    ".gen5-scopeTipKey{font-weight:600;flex:0 0 auto}"+
    ".gen5-scopeTipText{opacity:0.68;flex:1 1 auto}"+
    ".gen5-scopeTipTag{margin-left:auto;flex:0 0 auto;font-size:10px;padding:1px 7px;border-radius:999px;background:rgba(34,197,94,0.14);color:#22c55e;letter-spacing:0.02em}"+
    ".gen5-fineprint{font-size:11px;opacity:0.45;margin-top:7px;line-height:1.6}";

    var styleInjected = false;

    function ensureStyle() {
      if (styleInjected) return;
      if (typeof document === "undefined" || !document.head) return;
      var el = document.getElementById("dsh-gen5-console-css");
      if (!el) {
        el = document.createElement("style");
        el.id = "dsh-gen5-console-css";
        el.textContent = CONSOLE_CSS;
        document.head.appendChild(el);
      }
      styleInjected = true;
    }

    function VerdictBadge(props) {
      var verdict = props.verdict;
      if (!verdict) return react.createElement("span", { className: "gen5-badge gen5-badgeNeutral" }, "待运行");
      if (verdict === "pass") return react.createElement("span", { className: "gen5-badge gen5-verdictPass" }, "✓ 通过");
      if (verdict === "partial") return react.createElement("span", { className: "gen5-badge gen5-verdictPartial" }, "◐ 未完交付");
      if (verdict === "fallback" || verdict === "refusal") return react.createElement("span", { className: "gen5-badge gen5-verdictRefusal" }, "✗ 拒绝");
      return react.createElement("span", { className: "gen5-badge gen5-badgeNeutral" }, verdict);
    }

    // 注入流程时间线：每步一个圆点 + 名称 + 真实耗时/结果
    function FlowSteps(props) {
      var steps = props.steps || [];
      if (steps.length === 0) return null;
      return react.createElement(
        "div",
        { className: "gen5-flow" },
        steps.map(function (step, index) {
          var cls = "gen5-stepDot";
          var mark = "";
          if (step.status === "done") { cls += " gen5-stepDone"; mark = "✓"; }
          else if (step.status === "failed") { cls += " gen5-stepFailed"; mark = "✗"; }
          else if (step.status === "running") { cls += " gen5-stepRunning"; }
          else { cls += " gen5-stepPending"; }
          return react.createElement(
            "div",
            { key: step.id || index, className: "gen5-step" },
            react.createElement("span", { className: cls }, mark),
            react.createElement(
              "span",
              { className: "gen5-stepBody" },
              react.createElement("span", { className: "gen5-stepName" }, step.label),
              step.detail
                ? react.createElement("span", { className: "gen5-stepDetail" }, step.detail)
                : null
            )
          );
        })
      );
    }

    function CheckRow(props) {
      var check = props.check;
      var cls = check.pass ? "gen5-checkPass" : "gen5-checkFail";
      var icon = check.pass ? "✓" : "✗";
      return react.createElement(
        "div",
        { className: "gen5-check " + cls },
        react.createElement(
          "span",
          { className: "gen5-checkName" },
          react.createElement("span", null, icon),
          react.createElement("span", null, check.name)
        ),
        check.detail
          ? react.createElement("span", { className: "gen5-checkDetail" }, check.detail)
          : null
      );
    }

    function ArmorConsolePage(props) {
      ensureStyle();
      var useProjection = props.useProjection;
      var armor = typeof useProjection === "function" ? useProjection("armor") : undefined;

      var statePair = react.useState({ loading: false, result: null });
      var verifyResult = statePair[0];
      var setVerifyResult = statePair[1];

      // ---- 破甲启动控制：scope 状态轮询 + 切换 ----
      var scopePair = react.useState(null);
      var scope = scopePair[0];
      var setScope = scopePair[1];
      var scopeBusyPair = react.useState(false);
      var scopeBusy = scopeBusyPair[0];
      var setScopeBusy = scopeBusyPair[1];
      var scopeNotePair = react.useState("");
      var scopeNote = scopeNotePair[0];
      var setScopeNote = scopeNotePair[1];

      react.useEffect(function () {
        var alive = true;
        var apply = function (data) {
          if (!alive || !data) return;
          if (typeof data.scope === "string") setScope(data.scope);
          if (typeof data.version === "string") setHostVersion(data.version);
          if (data.envOverride) setScopeNote("范围已被环境变量 GEN5_SCOPE 固定：" + data.envOverride);
        };
        readScope(apply);
        var timer = setInterval(function () { readScope(apply); }, POLL_MS);
        return function () { alive = false; clearInterval(timer); };
      }, []);

      // ---- 自动瓦解扫描结果 + 注入流程 ----
      var scanPair = react.useState(null);
      var scan = scanPair[0];
      var setScan = scanPair[1];

      var versionPair = react.useState(null);
      var hostVersion = versionPair[0];
      var setHostVersion = versionPair[1];

      var flowPair = react.useState({ phase: "idle", steps: [], verdict: null, scope: null, ms: 0 });
      var flow = flowPair[0];
      var setFlow = flowPair[1];
      var flowBusyPair = react.useState(false);
      var flowBusy = flowBusyPair[0];
      var setFlowBusy = flowBusyPair[1];
      // engage 流程逐条揭示用的定时器：存 ref 以便面板卸载时清理
      var flowTimerRef = react.useRef(null);

      react.useEffect(function () {
        var alive = true;
        readDissolve(function (res) {
          if (!alive) return;
          if (res && res.ok && res.data) setScan(res.data);
          else setScan({ unavailable: true, status: (res && res.status) || 0, error: (res && res.error) || "unknown" });
        });
        return function () {
          alive = false;
          // 面板卸载时把 engage 流程的逐条揭示定时器一起清掉
          if (flowTimerRef.current !== null) {
            clearInterval(flowTimerRef.current);
            flowTimerRef.current = null;
          }
        };
      }, []);

      // 把后端的失败结果翻译成人话：最常见的其实是"宿主没重启，路由不存在"。
      function engageErrorText(res) {
        var status = (res && res.status) || 0;
        if (status === 404 || status === 405) return "后端路由 /gen5/engage 不存在 —— 宿主仍是旧版，重启 DeepSeek Harness 后重试";
        if (status === 409 || status === 429) return "上一轮注入仍在执行，等一下再点";
        if (status === 0) return "请求超时或中断（" + ((res && res.error) || "unknown") + "）";
        return "HTTP " + status + "：" + ((res && res.error) || "unknown");
      }

      function runEngage(target) {
        if (flowBusy) return;
        setFlowBusy(true);
        setFlow({ phase: "running", steps: [], verdict: null, scope: target, ms: 0 });
        engageInject(target, function (res) {
          if (!res || !res.ok || !res.data || !Array.isArray(res.data.steps)) {
            setFlowBusy(false);
            setFlow({
              phase: "failed",
              steps: [],
              verdict: "FAIL",
              scope: target,
              ms: 0,
              error: engageErrorText(res)
            });
            return;
          }
          var data = res.data;
          if (data.version) setHostVersion(data.version);
          if (data.scope) setScope(data.scope);
          var shown = [];
          var index = 0;
          var tick = function () {
            if (index >= data.steps.length) {
              if (flowTimerRef.current !== null) {
                clearInterval(flowTimerRef.current);
                flowTimerRef.current = null;
              }
              setFlowBusy(false);
              setFlow({
                phase: data.ok ? "done" : "failed",
                steps: data.steps,
                verdict: data.verdict || (data.ok ? "OK" : "FAIL"),
                scope: data.scope || target,
                meaning: data.scopeMeaning || "",
                ms: data.ms || 0
              });
              if (data.dissolve) setScan(data.dissolve);
              readVerify(function (result) { if (result) setVerifyResult(result); });
              return;
            }
            shown = shown.concat([data.steps[index]]);
            index += 1;
            setFlow(function (prev) { return Object.assign({}, prev, { steps: shown }); });
          };
          // 定时器存进 ref：面板卸载时由 cleanup 统一清掉，避免 setState-on-unmounted 泄漏。
          if (flowTimerRef.current !== null) clearInterval(flowTimerRef.current);
          flowTimerRef.current = setInterval(tick, 320);
          tick();
        });
      }

      function toggleScope() {
        if (scopeBusy) return;
        var next = scope === "global" ? "local" : "global";
        setScopeBusy(true);
        writeScope(next, function (data) {
          setScopeBusy(false);
          if (data && data.ok) {
            setScope(data.scope || next);
            setScopeNote("");
            return;
          }
          if (data && data.error === "env-override") {
            setScopeNote("已被环境变量 GEN5_SCOPE 固定，无法在界面切换");
            return;
          }
          setScopeNote("切换失败，请重试");
          setTimeout(function () { setScopeNote(""); }, 4000);
        });
      }

      // 部署自检：面板挂载即自动运行（带重试 + 周期轮询）——
      // 路由可能晚于面板就绪（webServer 稍后可用），失败重试确保最终能拿到结果。
      react.useEffect(function () {
        var alive = true;
        var attempts = 0;
        var timer = null;
        function poll() {
          readVerify(function (r) {
            if (!alive) return;
            if (r !== null) {
              setVerifyResult(r);
              attempts = 0;
            } else {
              attempts++;
            }
            timer = setTimeout(poll, attempts > 0 ? 2000 : 30000);
          });
        }
        poll();
        return function () { alive = false; if (timer) clearTimeout(timer); };
      }, []);

      var verdict = armor ? armor.verdict : null;
      var words = armor && armor.words ? armor.words : [];
      var isRunning = Boolean(armor && armor.running);
      var global = scope === "global";

      return react.createElement(
        "div",
        { className: "gen5-console" },
        // ---- Header ----
        react.createElement(
          "div",
          { className: "gen5-header" },
          react.createElement(
            "div",
            { className: "gen5-headerTop" },
            react.createElement(
              "span",
              { className: "gen5-title" },
              react.createElement("span", { className: "gen5-titleDot", style: isRunning ? { animation: "dshArmorPulse 1.2s ease-in-out infinite" } : undefined }),
              BADGE_LABEL
            ),
            react.createElement(VerdictBadge, { verdict: verdict })
          ),
          react.createElement("div", { className: "gen5-version" }, "v" + PLUGIN_VERSION)
        ),
        // ---- 启动注入：两个入口 + 步骤流程可视化 ----
        react.createElement(
          "div",
          { className: "gen5-section" },
          react.createElement("div", { className: "gen5-sectionTitle" }, "启动注入"),
          react.createElement(
            "div",
            { className: "gen5-row" },
            react.createElement("span", { className: "gen5-label" }, "注入范围"),
            react.createElement(
              "span",
              { className: "gen5-value" },
              scope === null
                ? "连接中…"
                : global ? "全部预设都有破甲" : "仅「破甲模式」有破甲"
            )
          ),
          react.createElement(
            "div",
            { className: "gen5-row" },
            react.createElement("span", { className: "gen5-label" }, "后端版本"),
            react.createElement(
              "span",
              { className: "gen5-value" },
              hostVersion === null
                ? "读取中…"
                : hostVersion === PLUGIN_VERSION
                  ? "v" + hostVersion + "（与客户端一致）"
                  : "宿主 v" + hostVersion + " ≠ 客户端 v" + PLUGIN_VERSION + " → 重启 DSH"
            )
          ),
          react.createElement(
            "div",
            { className: "gen5-row" },
            react.createElement("span", { className: "gen5-label" }, "宿主提示词层"),
            react.createElement(
              "span",
              { className: "gen5-value" },
              scan === null
                ? "读取中…"
                : scan.unavailable
                  ? "接口不可用（HTTP " + (scan.status || "-") + "）"
                  : scan.available
                    ? (scan.hostSections || []).length + " 段 / 约束 " + (scan.constrained || []).length + " / 已覆盖 " + (scan.covered || []).length
                    : "不可读（追加压制）"
            )
          ),
          react.createElement(
            "div",
            { className: "gen5-btnRow" },
            react.createElement(
              "button",
              {
                className: "gen5-btn gen5-btnOn" + (flowBusy ? " gen5-btnDisabled" : ""),
                disabled: flowBusy,
                title: "只对「破甲模式」生效，其它预设不受影响",
                onClick: function () { runEngage("local"); }
              },
              flowBusy ? "注入中…" : "🛡 一键隔离注入"
            ),
            react.createElement(
              "button",
              {
                className: "gen5-btn gen5-btnOff" + (flowBusy ? " gen5-btnDisabled" : ""),
                disabled: flowBusy,
                title: "所有预设都生效",
                onClick: function () { runEngage("global"); }
              },
              flowBusy ? "注入中…" : "⚡ 启动注入"
            )
          ),
          // 两个按钮的区别写在界面上：一句话一条，技术细节留在 README。
          react.createElement(
            "div",
            { className: "gen5-scopeTips" },
            react.createElement(
              "div",
              { className: "gen5-scopeTip" },
              react.createElement("span", { className: "gen5-scopeTipKey" }, "🛡 隔离注入"),
              react.createElement("span", { className: "gen5-scopeTipText" }, "只对「破甲模式」生效"),
              react.createElement("span", { className: "gen5-scopeTipTag" }, "日常推荐")
            ),
            react.createElement(
              "div",
              { className: "gen5-scopeTip" },
              react.createElement("span", { className: "gen5-scopeTipKey" }, "⚡ 启动注入"),
              react.createElement("span", { className: "gen5-scopeTipText" }, "所有预设都生效")
            )
          ),
          react.createElement(
            "div",
            { className: "gen5-fineprint" },
            "两者做的事相同，只是范围不同；点「隔离」不是关闭。改完约 3 秒生效。"
          ),
          react.createElement(FlowSteps, { steps: flow.steps }),
          flow.phase === "done"
            ? react.createElement(
                "div",
                { className: "gen5-banner gen5-bannerOk" },
                "✓ 已启动 · " + (flow.scope === "global" ? "全局" : "隔离") + " · " + (flow.ms || 0) + "ms"
              )
            : flow.phase === "failed"
              ? react.createElement(
                  "div",
                  { className: "gen5-banner gen5-bannerFail" },
                  "✗ 启动失败" + (flow.error ? "：" + flow.error : "")
                )
              : null,
          flow.phase === "failed"
            ? react.createElement(
                "div",
                { className: "gen5-fineprint" },
                "若刚切换过范围，实例接管约需 3 秒：稍等后重新自检或再点一次即可，已生效的覆盖不受影响。"
              )
            : null,
          flow.phase === "done" && flow.meaning
            ? react.createElement("div", { className: "gen5-scanHint" }, "本次范围：" + flow.meaning)
            : null,
          scan && scan.constrained && scan.constrained.length > 0
            ? react.createElement(
                "div",
                { className: "gen5-scanHint" },
                "命中约束层：" + scan.constrained.slice(0, 4).join(" · ")
              )
            : null,
          scopeNote
            ? react.createElement("div", { className: "gen5-scanHint" }, scopeNote)
            : null
        ),
        react.createElement(
          "div",
          { className: "gen5-section" },
          react.createElement("div", { className: "gen5-sectionTitle" }, "实时状态"),
          react.createElement(
            "div",
            { className: "gen5-row" },
            react.createElement("span", { className: "gen5-label" }, "当前状态"),
            react.createElement(
              "span",
              { className: "gen5-value" },
              isRunning ? "思考中" : verdict === "pass" ? "通过" : verdict === "refusal" || verdict === "fallback" ? "拒绝" : verdict === "partial" ? "未完交付" : "待运行"
            )
          ),
          react.createElement(
            "div",
            { className: "gen5-row" },
            react.createElement("span", { className: "gen5-label" }, "W5 再锚定触发"),
            react.createElement("span", { className: "gen5-value" }, (armor && armor.w5Count) || 0)
          ),
          react.createElement(
            "div",
            { className: "gen5-row" },
            react.createElement("span", { className: "gen5-label" }, "本轮拒绝词"),
            react.createElement(
              "span",
              { className: "gen5-value" },
              words.length > 0
                ? words
                    .slice(0, 3)
                    .map(function (w, i) { return react.createElement("span", { key: i, className: "gen5-word" }, w) })
                : "无"
            )
          )
        ),
        react.createElement(
          "div",
          { className: "gen5-section" },
          react.createElement("div", { className: "gen5-sectionTitle" }, "部署自检"),
          verifyResult === null
            ? "未运行"
            : verifyResult.loading
              ? "检查中…"
              : react.createElement(
                  "div",
                  null,
                  (verifyResult.checks || []).map(function (c, i) {
                    return react.createElement(CheckRow, { key: i, check: c });
                  }),
                  react.createElement(
                    "div",
                    { style: { marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(128,128,128,0.12)" } },
                    verifyResult.verdict === "OK"
                      ? react.createElement(
                          "span",
                          { className: "gen5-badge gen5-badgePass" },
                          "✓ 部署验证通过"
                        )
                      : react.createElement(
                          "span",
                          { className: "gen5-badge gen5-badgeFail" },
                          "✗ 部署验证失败"
                        )
                  )
              )
        )
      )
    }

    function ArmorPanelIcon() {
      return react.createElement(
        "span",
        { style: { display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px" } },
        "⚡"
      );
    }

    function ArmorDock(props) {
      ensureStyle();
      var useProjection = props.useProjection;
      // 只有选中「破甲模式」预设的会话显示徽标；全局启用后所有预设都显示（可点回去）。
      var preset = typeof useProjection === "function" ? useProjection("agentPreset") : undefined;
      var armor = typeof useProjection === "function" ? useProjection("armor") : undefined;

      var lastVerdictRef = react.useRef(null);
      var flashUntilRef = react.useRef(0);
      var tickPair = react.useState(0);
      var setTick = tickPair[1];

      // ---- scope 轮询：徽标点击切换（gen-4 同源约定）----
      var scopePair = react.useState(null);
      var scope = scopePair[0];
      var setScope = scopePair[1];
      var busyPair = react.useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];
      var notePair = react.useState("");
      var note = notePair[0];
      var setNote = notePair[1];

      react.useEffect(
        function () {
          var alive = true;
          var apply = function (data) {
            if (!alive || !data) return;
            if (typeof data.scope === "string") setScope(data.scope);
            if (data.envOverride) setNote("范围已被环境变量 GEN5_SCOPE 固定：" + data.envOverride);
          };
          readScope(apply);
          var timer = setInterval(function () { readScope(apply); }, POLL_MS);
          return function () { alive = false; clearInterval(timer); };
        },
        []
      );

      react.useEffect(
        function () {
          var styleEl = null;
          if (!document.getElementById("dsh-armor-css-gen5")) {
            styleEl = document.createElement("style");
            styleEl.id = "dsh-armor-css-gen5";
            styleEl.textContent = ANIM_CSS;
            document.head.appendChild(styleEl);
          }
          return function () {
            if (styleEl && styleEl.parentNode) {
              styleEl.parentNode.removeChild(styleEl);
            }
          };
        },
        []
      );

      react.useEffect(
        function () {
          var now = Date.now();
          var verdict = armor ? armor.verdict : null;
          if (verdict && verdict !== lastVerdictRef.current) {
            lastVerdictRef.current = verdict;
            if (verdict === "refusal" || verdict === "fallback" || verdict === "partial" || verdict === "pass") {
              flashUntilRef.current = now + FLASH_MS;
              setTick(function (v) { return v + 1; });
            }
          }
        },
        [armor && armor.verdict]
      );

      react.useEffect(
        function () {
          var timer = setInterval(function () {
            if (Date.now() > flashUntilRef.current) {
              clearInterval(timer);
              setTick(function (v) { return v + 1; });
            }
          }, 200);
          return function () { clearInterval(timer); };
        },
        [armor && armor.verdict]
      );

      var global = scope === "global";
      var visible = preset === "armor" || global;
      if (!visible) return null;

      function onClick() {
        if (busy) return;
        var next = global ? "local" : "global";
        setBusy(true);
        writeScope(next, function (data) {
          setBusy(false);
          if (data && data.ok) {
            setScope(data.scope || next);
            setNote("");
            return;
          }
          if (data && data.error === "env-override") {
            setNote("已被环境变量 GEN5_SCOPE 固定，无法在界面切换");
            return;
          }
          setNote("切换失败，请重试");
          setTimeout(function () { setNote(""); }, 4000);
        });
      }

      var verdict = armor ? armor.verdict : null;
      var isRunning = Boolean(armor && armor.running);
      var isPass = verdict === "pass";
      var isPartial = verdict === "partial";
      var isRefusal = verdict === "refusal" || verdict === "fallback";
      var flashing = Date.now() < flashUntilRef.current && verdict !== null;
      var dotColor = isRefusal ? "#ef4444" : isPartial ? "#eab308" : "#22c55e";
      var dotStyle = { ...DOT_STYLE, background: dotColor };
      var text = BADGE_TEXT;
      var badgeStyle = { ...BADGE_STYLE };

      if (isRunning) {
        dotStyle.animation = "dshArmorPulse 1.2s ease-in-out infinite";
        text += " · 思考中…";
      } else if (flashing) {
        if (isPass) {
          text += " · ✓ 通过";
          badgeStyle.animation = "dshArmorFlash 0.4s ease";
        } else if (isPartial) {
          text += " · ◐ 未完交付";
          badgeStyle.animation = "dshArmorFlash 0.4s ease";
          badgeStyle.borderColor = "rgba(234,179,8,.5)";
          dotStyle.background = "#eab308";
        } else if (isRefusal) {
          var word = armor && armor.words && armor.words.length > 0 ? armor.words[0] : "拒绝";
          text += " · ✗ " + word;
          badgeStyle.animation = "dshArmorFlash 0.4s ease";
          badgeStyle.borderColor = "rgba(239,68,68,.5)";
          dotStyle.background = "#ef4444";
        }
      }
      if (note) text = note;
      if (busy) badgeStyle.opacity = "0.6";

      var title = global
        ? "当前：全部模式都注入破甲框架（点击改为「只有破甲模式」）"
        : "当前：只有破甲模式的会话注入（点击改为「全部模式都启用」";

      return react.createElement(
        "div",
        { style: WRAP_STYLE },
        react.createElement(
          "span",
          {
            style: badgeStyle,
            "data-armor": "gen5",
            "data-scope": scope || "unknown",
            "data-verdict": verdict || "none",
            "data-armor-badge": BADGE_TEXT,
            title: title,
            onClick: onClick,
            onKeyDown: function (event) {
              if (event.key === "Enter" || event.key === " ") onClick();
            },
          },
          react.createElement("span", { style: dotStyle }),
          react.createElement("span", null, text)
        )
      );
    }

    // ============ Plugin apply: register sidebar panel + input badge ============

    var PANEL_NS = "armor-gen5";

    function apply(ctx) {
      // 诊断缓冲:面板注册的任何异常都要能事后看到,而不是静默消失。
      function diag(label, e) {
        try {
          window.__dshArmorDiag = window.__dshArmorDiag || [];
          window.__dshArmorDiag.push({ label: label, message: String((e && e.message) || e) });
        } catch {
          // 非浏览器环境
        }
      }

      // locale 注册全兜底:任何一步抛错都不允许中断后面的面板注册。
      // (cordis 下访问未 inject 的服务属性会抛;生效样本 dsh-infinite-gen-5 的
      //  每个 slots.register 也都包了 try/catch,这里保持一致。)
      try {
        ctx.effect(function () {
          return ctx.locale.register(PANEL_NS, {
            zh: { panel: PANEL_LABEL },
            en: { panel: "Infinite Gen 5" }
          });
        }, "armor-gen5: locale");
      } catch (e) {
        diag("locale-register-error", e);
      }

      // Expose tools for the console to call (backed by /gen5/* HTTP routes)
      // 插件不再依赖宿主注入 __dshGen5Tools：数据全部走宿主侧注册的 HTTP 路由
      // （/gen5/verify），与徽标 scope 轮询同源。
      try {
        window.__dshGen5Tools = window.__dshGen5Tools || {
          _listeners: [],
          verify: function () {
            return new Promise(function (resolve) { readVerify(resolve); });
          },
        };
      } catch {
        // Non-browser environment
      }

      // Register main panel (armor console page)
      // 注意:slot 定义只允许 name/key/label 这几个字段。
      // 之前多写的 `inject` 字段不是 slot 定义字段,会让 register 失败或组件 props 错乱。
      try {
        ctx.slots.inject("main", function () {
          return ctx.slots.register(
            {
              name: "main",
              key: PANEL_ID,
              label: PANEL_LABEL,
            },
            ArmorConsolePage
          );
        });
      } catch (e) {
        diag("main-register-error", e);
      }

      // Register sidebar panel icon
      try {
        ctx.slots.inject("sidebar.panellist", function () {
          return ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: PANEL_ID,
              order: 5,
              label: PANEL_LABEL
            },
            ArmorPanelIcon
          );
        });
      } catch (e) {
        diag("sidebar-register-error", e);
      }

      // Register input dock badge
      try {
        ctx.slots.inject("conversation.input.dock", function () {
          return ctx.slots.register(
            {
              name: "conversation.input.dock",
              id: "armor",
              order: 30,
            },
            ArmorDock
          );
        });
      } catch (e) {
        diag("dock-register-error", e);
      }
    }

    exports.name = "dsh-armor-gen5";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
