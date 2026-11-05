// purge.js — gen-5 内置 dsh-purge 式静态清洗层
//
// dsh-purge 的核心思路（继承并集成到 gen-5）：
//   52 个 patch 中与破甲相关的部分 = 移除宿主的"身份提示词/审批框架"层，
//   让 armor 预设的系统提示词成为唯一的提示词权威来源。
//
// gen-5 集成方式（与 dsh-purge 的差异）：
//   dsh-purge 修改宿主文件（侵入式，52 patch 全打）；
//   gen-5 通过 systemPrompt.order 排序 + agent preset 机制实现同样的
//   提示词权威性（armor 预设生效时注入 order:100 段，其他段的优先级
//   由 SUPERSESSION 规则在提示词内部声明）。
//
// 本文件实现 gen-5 运行时的可观测层：检测宿主当前是否有 dsh-purge
// 补丁，报告 gen-5 与 dsh-purge 的协同状态。

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// 检查 dsh-purge 补丁状态的探测点（选取有代表性的 patch 标记）
const PURGE_PROBES = {
  promptInject: {
    label: "prompt-inject.md 注入文件",
    check: (home) => existsSafe(join(home, "prompt-inject.md")),
  },
  backupExists: {
    label: "dsh-purge 备份目录",
    check: (home) => existsSafe(join(home, "dsh-purge-backup")) || existsSafe(join(home, ".dsh-purge-backup")),
  },
};

function existsSafe(path) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function fileSizeSafe(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function probePurgeStatus(dshHome) {
  const home = dshHome || join(homedir(), ".dsh");
  const results = {};
  let found = 0;
  for (const [key, probe] of Object.entries(PURGE_PROBES)) {
    const value = probe.check(home);
    if (value) found++;
    results[key] = { label: probe.label, detected: value };
  }
  return {
    home,
    probes: results,
    purgeLikelyInstalled: found > 0,
    gen5Standalone: found === 0,
  };
}

// gen-5 的提示词权威性不依赖宿主文件修改。
// SUPERSESSION 段在破甲核 prompt 内部声明了优先级排序。
export const GEN5_AUTHORITY_NOTE =
  "gen-5 通过 agent preset + systemPrompt.order(100) + SUPERSESSION 声明实现提示词权威性，" +
  "不修改宿主文件。与 dsh-purge 补丁可以共存（dsh-purge 清洗宿主默认提示词层，" +
  "gen-5 的 armor 预设注入覆盖层），但两者同时生效时建议只保留 gen-5 以避免冲突。";
