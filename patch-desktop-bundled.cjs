// patch-desktop-bundled.js — 把 dsh-purge / dsh-infinite-gen-3 移入 DSH 桌面端退役清单
//
// 背景：DSH 桌面端 main.js 硬编码 DESKTOP_BUNDLED_PLUGINS（每次启动强制物化
// 这些插件到 profile），只有 DESKTOP_RETIRED_PLUGINS 里的插件会被启动时自动
// 清除。本脚本把 dsh-infinite-gen-3 与 dsh-purge 从前者移到后者，使 DSH 自己
// 完成卸载与"不再写回"。
//
// 用法：node patch-desktop-bundled.js [main.js 路径]
//   缺省路径 = 本机 DeepSeek Harness 安装
// 安全：自动备份为 main.js.bak-armor5；patch 后 node --check 验证，失败自动回滚。
//
// 注意：DeepSeek Harness 更新版本后 main.js 会被覆盖，需要重跑本脚本。

const { readFileSync, writeFileSync, copyFileSync, existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

const DEFAULT_MAIN =
  "C:/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/app/lib/main.js";
const mainPath = process.argv[2] || DEFAULT_MAIN;

const BUNDLED_HEADER = "const DESKTOP_BUNDLED_PLUGINS = [";
const RETIRED_HEADER = "const DESKTOP_RETIRED_PLUGINS = [";
const REMOVE_FROM_BUNDLED = ["dsh-infinite-gen-3", "dsh-purge"];
const APPEND_TO_RETIRED = ["dsh-infinite-gen-3", "dsh-purge"];

function editArrayBlock(src, header, transform, label) {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`未找到 ${label}（${header}）——版本可能不兼容，人工检查`);
  const end = src.indexOf("];", start);
  if (end < 0) throw new Error(`${label} 数组未闭合`);
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const block = src.slice(start, end + 2);
  const patched = transform(block, eol);
  return src.slice(0, start) + patched + src.slice(end + 2);
}

let src = readFileSync(mainPath, "utf8");
const original = src;

// 1. 捆绑清单：删掉两行（连带行尾换行）
src = editArrayBlock(src, BUNDLED_HEADER, (block, eol) => {
  const lines = block.split(eol);
  const kept = lines.filter(
    (line) => !REMOVE_FROM_BUNDLED.some((name) => line.trim() === `"${name}",` || line.trim() === `"${name}"`),
  );
  const removed = lines.length - kept.length;
  if (removed !== REMOVE_FROM_BUNDLED.length) {
    throw new Error(`捆绑清单匹配到 ${removed} 行（期望 ${REMOVE_FROM_BUNDLED.length}），中止以防误伤`);
  }
  return kept.join(eol);
}, "DESKTOP_BUNDLED_PLUGINS");

// 2. 退役清单：追加两行（放在最后一个条目之后，保持 JS 合法：末条补逗号）
src = editArrayBlock(src, RETIRED_HEADER, (block, eol) => {
  if (APPEND_TO_RETIRED.some((name) => block.includes(`"${name}"`))) {
    return block; // 已在退役清单，幂等
  }
  const lines = block.split(eol);
  const closeIdx = lines.findIndex((line) => line.trim() === "];");
  if (closeIdx < 1) throw new Error("退役清单结构异常");
  const lastEntryIdx = closeIdx - 1;
  // 末条目补逗号，插入的新条目之间也要逗号（最后一个不加，由 ]; 收尾）
  lines[lastEntryIdx] = lines[lastEntryIdx].replace(/",\s*$/, '",').replace(/"$/, '",');
  const inserted = APPEND_TO_RETIRED.map(
    (name, i) => `\t"${name}"${i < APPEND_TO_RETIRED.length - 1 ? "," : ""}`,
  );
  lines.splice(lastEntryIdx + 1, 0, ...inserted);
  return lines.join(eol);
}, "DESKTOP_RETIRED_PLUGINS");

if (src === original) {
  console.log("无变化（可能已 patch 过）。");
  process.exit(0);
}

// 3. 备份 + 写入 + 语法验证（失败回滚）
const backup = `${mainPath}.bak-armor5`;
copyFileSync(mainPath, backup);
writeFileSync(mainPath, src);
try {
  execFileSync(process.execPath, ["--check", mainPath], { stdio: "pipe" });
  console.log(`[OK] main.js 已 patch（备份: ${backup}）`);
  console.log("     - DESKTOP_BUNDLED_PLUGINS: 移除 dsh-infinite-gen-3, dsh-purge");
  console.log("     - DESKTOP_RETIRED_PLUGINS: 加入 dsh-infinite-gen-3, dsh-purge");
  console.log("     重启 DeepSeek Harness 后自动卸载两者且不再写回。");
} catch (error) {
  copyFileSync(backup, mainPath);
  console.error("[!] patch 后语法验证失败，已回滚备份。错误：");
  console.error(String(error).slice(0, 500));
  process.exit(1);
}
