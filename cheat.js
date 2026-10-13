// 破解版面板：通过 game.js 暴露的 window.FishCheat 调试接口驱动。
// 本文件自绘 UI，不依赖 index.html 结构；作弊局成绩不会提交全球排行榜。
(function () {
  "use strict";

  const api = window.FishCheat;
  if (!api) return;

  const GAME_W = 420;
  const GAME_H = 620;
  const state = api.getState();
  const stageList = api.getStageList();

  // ---------- styles ----------
  const style = document.createElement("style");
  style.textContent = `
    #cheat-toggle {
      position: fixed; right: 14px; bottom: 14px; z-index: 9999;
      padding: 8px 12px; border-radius: 999px; border: 1px solid #888;
      background: #1f2430; color: #ffd479; font-size: 13px; cursor: pointer;
      font-family: inherit; opacity: 0.75;
    }
    #cheat-toggle:hover { opacity: 1; }
    #cheat-panel {
      position: fixed; right: 14px; bottom: 54px; z-index: 9999;
      width: 240px; padding: 12px; border-radius: 12px;
      background: #1f2430; color: #eee; border: 1px solid #4a5164;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
      font: 13px/1.5 "Microsoft YaHei", sans-serif; display: none;
    }
    #cheat-panel.open { display: block; }
    #cheat-panel h3 { margin: 0 0 8px; font-size: 14px; color: #ffd479; }
    #cheat-panel label.row { display: flex; align-items: center; gap: 6px; margin: 4px 0; cursor: pointer; }
    #cheat-panel .group { margin: 8px 0; padding-top: 8px; border-top: 1px solid #333a4c; }
    #cheat-panel select, #cheat-panel button {
      font: inherit; border-radius: 6px; border: 1px solid #4a5164;
      background: #2b3242; color: #eee; padding: 3px 8px; cursor: pointer;
    }
    #cheat-panel button { margin: 3px 3px 0 0; }
    #cheat-panel button:hover { background: #39415a; }
    #cheat-panel button.active { background: #7a5b1e; border-color: #ffd479; color: #ffd479; }
    #cheat-panel select { width: 100%; margin: 2px 0 6px; }
    #cheat-note { margin-top: 8px; font-size: 11px; color: #9aa3b5; }
  `;
  document.head.appendChild(style);

  // ---------- DOM ----------
  const toggleButton = document.createElement("button");
  toggleButton.id = "cheat-toggle";
  toggleButton.textContent = "🧪 破解";
  document.body.appendChild(toggleButton);

  const panel = document.createElement("div");
  panel.id = "cheat-panel";
  panel.innerHTML = `
    <h3>🧪 破解面板</h3>
    <label class="row"><input type="checkbox" id="cheat-items"> 无限道具（重锤无限次不扣分、复活不耗卡）</label>
    <label class="row"><input type="checkbox" id="cheat-nogameover"> 永不结束（危险区自动清理）</label>
    <div class="group">
      当前持有 <select id="cheat-current"></select>
      下一只 <select id="cheat-next"></select>
    </div>
    <div class="group">
      <button id="cheat-add1">+1000 分</button>
      <button id="cheat-add2">+10000 分</button>
    </div>
    <div class="group">
      <button id="cheat-upmode">点击升级模式</button>
      <button id="cheat-hammer">立即重锤</button>
      <button id="cheat-revive">一键复活</button>
      <button id="cheat-clear">清理危险区</button>
    </div>
    <div id="cheat-note">提示：作弊局的分数只保存在本机，不会提交全球排行榜。</div>
  `;
  document.body.appendChild(panel);

  const itemsBox = panel.querySelector("#cheat-items");
  const noGameOverBox = panel.querySelector("#cheat-nogameover");
  const currentSelect = panel.querySelector("#cheat-current");
  const nextSelect = panel.querySelector("#cheat-next");
  const upgradeModeButton = panel.querySelector("#cheat-upmode");
  const noteNode = panel.querySelector("#cheat-note");

  for (const select of [currentSelect, nextSelect]) {
    stageList.forEach((stage, level) => {
      const option = document.createElement("option");
      option.value = String(level);
      option.textContent = `${String(level + 1).padStart(2, "0")} · ${stage.id}`;
      select.appendChild(option);
    });
  }

  // ---------- behaviour ----------
  toggleButton.addEventListener("click", () => panel.classList.toggle("open"));

  itemsBox.addEventListener("change", () => {
    api.setUnlimitedItems(itemsBox.checked);
    syncNote();
  });
  noGameOverBox.addEventListener("change", () => {
    api.setNoGameOver(noGameOverBox.checked);
    syncNote();
  });
  currentSelect.addEventListener("change", () => api.setCurrentLevel(Number(currentSelect.value)));
  nextSelect.addEventListener("change", () => api.setNextLevel(Number(nextSelect.value)));
  panel.querySelector("#cheat-add1").addEventListener("click", () => api.addScore(1000));
  panel.querySelector("#cheat-add2").addEventListener("click", () => api.addScore(10000));
  panel.querySelector("#cheat-hammer").addEventListener("click", () => api.beginHammer());
  panel.querySelector("#cheat-revive").addEventListener("click", () => {
    if (!api.reviveNow()) setNote("当前没有可用的复活（需游戏结束，或先开启无限道具）。");
  });
  panel.querySelector("#cheat-clear").addEventListener("click", () => {
    const removed = api.clearDangerZone();
    setNote(removed ? `已清理危险区 ${removed} 个角色。` : "危险区没有角色。");
  });

  // 点击升级：开启后点画布中的角色直接升一阶。
  let upgradeMode = false;
  upgradeModeButton.addEventListener("click", () => {
    upgradeMode = !upgradeMode;
    upgradeModeButton.classList.toggle("active", upgradeMode);
  });
  const canvas = document.getElementById("game");
  canvas.addEventListener("pointerdown", (event) => {
    if (!upgradeMode) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const gameX = ((event.clientX - bounds.left) / bounds.width) * GAME_W;
    const gameY = ((event.clientY - bounds.top) / bounds.height) * GAME_H;
    const pieces = api.getPieces();
    // 自上而下找包含点击点的角色。
    const hit = [...pieces].reverse().find((piece) => gameX >= piece.bounds.left && gameX <= piece.bounds.right
      && gameY >= piece.bounds.top && gameY <= piece.bounds.bottom);
    if (!hit) return;
    if (!api.upgradePiece(hit.id)) setNote("已经是最高阶，无法继续升级。");
  }, true);

  function setNote(message) {
    noteNode.textContent = message;
  }

  function syncNote() {
    setNote(api.getState().usedThisRun
      ? "作弊局成绩只保存在本机，不会提交全球排行榜。"
      : "提示：作弊局的分数只保存在本机，不会提交全球排行榜。");
  }

  // 定时同步下拉框与勾选状态，避免面板和游戏状态脱节。
  window.setInterval(() => {
    const now = api.getState();
    itemsBox.checked = now.unlimitedItems;
    noGameOverBox.checked = now.noGameOver;
    if (document.activeElement !== currentSelect) currentSelect.value = String(now.currentLevel);
    if (document.activeElement !== nextSelect) nextSelect.value = String(now.nextLevel);
    const hammerNote = now.unlimitedItems ? "重锤无限" : "";
    if (hammerNote && upgradeModeButton.title !== hammerNote) upgradeModeButton.title = hammerNote;
  }, 500);
})();
