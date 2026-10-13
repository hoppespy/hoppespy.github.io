// 音效模块：全部用 Web Audio API 实时合成，不需要任何音频文件。
// 暴露 window.FishSound.play(name, ...)；静音状态保存在 localStorage。
(function () {
  "use strict";

  const STORAGE_KEY = "big-fish-sound-muted";
  let context = null;
  let muted = false;
  try { muted = window.localStorage.getItem(STORAGE_KEY) === "1"; } catch (_) { /* 静音设置是可选的 */ }

  function ensureContext() {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      context = new AudioContextClass();
    }
    if (context.state === "suspended") context.resume();
    return context;
  }

  // 浏览器要求首次用户交互后才能出声。
  function unlock() {
    ensureContext();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  }
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  function now() {
    return context.currentTime;
  }

  function tone({ type = "sine", from = 440, to = null, start = 0, duration = 0.15, volume = 0.2, curve = "exp" }) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now() + start;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, startAt);
    if (to !== null) {
      if (curve === "exp") oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), startAt + duration);
      else oscillator.frequency.linearRampToValueAtTime(Math.max(1, to), startAt + duration);
    }
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function noise({ start = 0, duration = 0.12, volume = 0.25, lowpass = 1200 }) {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now() + start);
  }

  const PLAYERS = {
    // 放下角色：轻快的"啵"一声
    drop() {
      tone({ type: "triangle", from: 340, to: 190, duration: 0.09, volume: 0.16 });
    },
    // 合成：水泡"咕咚"，角色阶数越高音调越低、音色越厚
    merge({ level = 0 } = {}) {
      const base = 520 - level * 26;
      tone({ type: "sine", from: base, to: base * 0.55, duration: 0.16, volume: 0.22 });
      tone({ type: "sine", from: base * 1.5, to: base * 0.8, start: 0.06, duration: 0.14, volume: 0.12 });
    },
    // 连击：随连击数升高的短琶音
    combo({ count = 3 } = {}) {
      const base = 440;
      const steps = Math.min(count, 6);
      for (let index = 0; index < steps; index += 1) {
        tone({ type: "square", from: base * Math.pow(1.2, index), duration: 0.07, start: index * 0.055, volume: 0.07 });
      }
    },
    // 解锁黄金/至尊角色：小号角
    achievement() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, index) => {
        tone({ type: "triangle", from: freq, duration: index === notes.length - 1 ? 0.34 : 0.13, start: index * 0.12, volume: 0.16 });
      });
    },
    // 合成大肥鱼：加长的胜利号角
    bigfish() {
      const notes = [392, 523, 659, 784, 1047, 1319];
      notes.forEach((freq, index) => {
        tone({ type: "triangle", from: freq, duration: index === notes.length - 1 ? 0.5 : 0.14, start: index * 0.11, volume: 0.17 });
        tone({ type: "sine", from: freq / 2, duration: 0.14, start: index * 0.11, volume: 0.1 });
      });
    },
    // 重锤砸击：低音闷响 + 碎裂噪声
    hammer() {
      tone({ type: "sine", from: 150, to: 55, duration: 0.22, volume: 0.3 });
      noise({ duration: 0.16, volume: 0.2, lowpass: 2200 });
    },
    // 游戏结束：下行三连音
    gameover() {
      const notes = [440, 349, 262];
      notes.forEach((freq, index) => {
        tone({ type: "sine", from: freq, to: freq * 0.92, duration: 0.3, start: index * 0.22, volume: 0.2 });
      });
    },
    // 复活：上扬扫频
    revive() {
      tone({ type: "sine", from: 330, to: 880, duration: 0.4, volume: 0.18 });
      tone({ type: "triangle", from: 660, to: 1320, start: 0.18, duration: 0.3, volume: 0.12 });
    },
    // 面板按钮反馈
    ui() {
      tone({ type: "triangle", from: 660, to: 880, duration: 0.06, volume: 0.08 });
    },
  };

  function play(name, options) {
    if (muted) return;
    const player = PLAYERS[name];
    if (!player) return;
    if (!ensureContext()) return;
    if (context.state !== "running") return;
    try { player(options); } catch (_) { /* 音效失败不影响游戏 */ }
  }

  function applyMuteState() {
    if (muteIcon) {
      muteIcon.classList.toggle("fa-volume-high", !muted);
      muteIcon.classList.toggle("fa-volume-xmark", muted);
    }
    if (muteLabel) muteLabel.textContent = muted ? "开启音效" : "关闭音效";
  }

  function setMuted(next) {
    muted = next;
    try { window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"); } catch (_) { /* 设置是可选的 */ }
    applyMuteState();
    if (!muted) play("ui");
  }

  // 静音按钮：如果侧栏里放了这个按钮就接管它。
  const muteButton = document.getElementById("sound-toggle");
  const muteIcon = muteButton?.querySelector("i");
  const muteLabel = muteButton?.querySelector(".utility-label");
  if (muteButton) {
    muteButton.addEventListener("click", () => setMuted(!muted));
    applyMuteState();
  }

  window.FishSound = { play, setMuted, isMuted: () => muted };
})();
