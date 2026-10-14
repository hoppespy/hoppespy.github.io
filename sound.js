// 音效模块：全部用 Web Audio API 实时合成，不需要任何音频文件。
// 暴露 window.FishSound.play(name, ...)；静音状态保存在 localStorage。
(function () {
  "use strict";

  const STORAGE_KEY = "big-fish-sound-muted";
  let context = null;
  let masterGain = null;
  let muted = false;
  try { muted = window.localStorage.getItem(STORAGE_KEY) === "1"; } catch (_) { /* 静音设置是可选的 */ }

  function ensureContext() {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      context = new AudioContextClass();
      // 主增益 + 压限器：整体提高响度，同时防止多层音效叠加时爆音。
      masterGain = context.createGain();
      masterGain.gain.value = 2.2;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      masterGain.connect(compressor).connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
    return context;
  }

  // 浏览器要求首次用户交互后才能出声。
  function unlock() {
    ensureContext();
    if (musicSelection !== "off") startMusic();
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
    oscillator.connect(gain).connect(masterGain);
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
    source.connect(filter).connect(gain).connect(masterGain);
    source.start(now() + start);
  }

  // ---------- 背景音乐 ----------
  // 经典钢琴曲片段（均为公有领域），音符序列 [MIDI 音高, 起始拍, 时值拍] 实时合成。
  const MUSIC_STORAGE_KEY = "big-fish-music"; // "off" 或曲目下标
  const midiFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  const TRACKS = [
    {
      name: "致爱丽丝",
      bpm: 132,
      loop: 80,
      // 主题 → B 段琶音 → 主题 → 高八度 B 段（高潮）→ 主题再现
      notes: (() => {
        const theme = [
          [76, 0, 0.5], [75, 0.5, 0.5], [76, 1, 0.5], [75, 1.5, 0.5], [76, 2, 0.5], [71, 2.5, 0.5], [74, 3, 0.5], [72, 3.5, 0.5],
          [69, 4, 1.5], [60, 4, 0.5], [64, 4.5, 0.5], [69, 5, 0.5],
          [71, 5.5, 1.5], [59, 6, 0.5], [64, 6.5, 0.5], [68, 7, 0.5],
          [72, 7.5, 1.5], [60, 8, 0.5], [64, 8.5, 0.5], [68, 9, 0.5],
          [76, 9.5, 0.5], [75, 10, 0.5],
          [76, 10.5, 0.5], [75, 11, 0.5], [76, 11.5, 0.5], [71, 12, 0.5], [74, 12.5, 0.5], [72, 13, 0.5],
          [69, 13.5, 1], [60, 13.5, 0.5], [64, 14, 0.5], [68, 14.5, 0.5], [64, 15, 0.5],
        ];
        const arpeggioSection = (startBeat, octaveUp) => {
          const shift = octaveUp ? 12 : 0;
          const notes = [];
          for (let beat = 0; beat < 8; beat += 2) {
            for (const offset of [0, 1]) {
              notes.push(
                [69 + shift, startBeat + beat + offset, 0.5],
                [72 + shift, startBeat + beat + offset + 0.5, 0.5],
                [76 + shift, startBeat + beat + offset + 1, 0.5],
              );
              notes.push([57, startBeat + beat + offset, 1], [52, startBeat + beat + offset + 1, 1]);
            }
          }
          for (let beat = 8; beat < 16; beat += 2) {
            for (const offset of [0, 1]) {
              notes.push(
                [64 + shift, startBeat + beat + offset, 0.5],
                [68 + shift, startBeat + beat + offset + 0.5, 0.5],
                [71 + shift, startBeat + beat + offset + 1, 0.5],
              );
              notes.push([52, startBeat + beat, 2]);
            }
          }
          return notes;
        };
        const shiftSection = (section, startBeat, octaveUp = false) =>
          section.map(([midi, beat, beats]) => [midi + (octaveUp ? 12 : 0), beat + startBeat, beats]);
        return [
          ...theme,
          ...arpeggioSection(16, false),
          ...shiftSection(theme, 32),
          ...arpeggioSection(48, true),
          ...shiftSection(theme, 64),
        ];
      })(),
    },
    {
      name: "欢乐颂",
      bpm: 120,
      loop: 96,
      // 原调 → 高八度 → 高八度加强（低音下沉，高潮）
      notes: (() => {
        const melody = [
          [64, 0, 1], [64, 1, 1], [65, 2, 1], [67, 3, 1], [67, 4, 1], [65, 5, 1], [64, 6, 1], [62, 7, 1],
          [60, 8, 1], [60, 9, 1], [62, 10, 1], [64, 11, 1], [64, 12, 1], [62, 13, 1], [62, 14, 2],
          [64, 16, 1], [64, 17, 1], [65, 18, 1], [67, 19, 1], [67, 20, 1], [65, 21, 1], [64, 22, 1], [62, 23, 1],
          [60, 24, 1], [60, 25, 1], [62, 26, 1], [64, 27, 1], [62, 28, 1], [60, 29, 1], [60, 30, 2],
        ];
        const bass = [
          [48, 0, 4], [43, 4, 4], [48, 8, 4], [43, 12, 4],
          [48, 16, 4], [43, 20, 4], [48, 24, 4], [43, 28, 2], [48, 30, 2],
        ];
        const makePass = (startBeat, melodyShift, bassShift) => [
          ...melody.map(([midi, beat, beats]) => [midi + melodyShift, beat + startBeat, beats]),
          ...bass.map(([midi, beat, beats]) => [midi + bassShift, beat + startBeat, beats]),
        ];
        return [...makePass(0, 0, 0), ...makePass(32, 12, 0), ...makePass(64, 12, -12)];
      })(),
    },
    {
      name: "D大调卡农",
      bpm: 120,
      loop: 128,
      // 主题 → 四分音符变奏 → 八分音符变奏（高潮）→ 高八度主题再现
      notes: (() => {
        const theme = [
          [78, 0, 2], [76, 2, 2], [74, 4, 2], [73, 6, 2], [71, 8, 2], [69, 10, 2], [71, 12, 2], [73, 14, 2],
          [74, 16, 2], [73, 18, 2], [71, 20, 2], [69, 22, 2], [67, 24, 2], [66, 26, 2], [67, 28, 2], [64, 30, 2],
        ];
        const bassRoots = [
          [50, 0, 4], [45, 4, 4], [47, 8, 4], [42, 12, 4],
          [43, 16, 4], [50, 20, 4], [43, 24, 4], [45, 28, 4],
        ];
        const chords = [
          [50, [74, 78, 81]],   // D
          [45, [73, 76, 81]],   // A
          [47, [71, 74, 78]],   // Bm
          [42, [69, 73, 78]],   // F#m
          [43, [67, 71, 74]],   // G
          [50, [74, 78, 81]],   // D
          [43, [67, 71, 74]],   // G
          [45, [69, 73, 76]],   // A
        ];
        const buildVariation = (startBeat, notesPerBeat) => {
          const notes = [];
          chords.forEach(([root, chord], index) => {
            const barBeat = startBeat + index * 4;
            notes.push([root, barBeat, 4]);
            for (let step = 0; step < 4 * notesPerBeat; step += 1) {
              const cycle = chord.concat([chord[1]]);
              notes.push([cycle[step % cycle.length], barBeat + step / notesPerBeat, 1 / notesPerBeat]);
            }
          });
          return notes;
        };
        const octaveTheme = [
          ...theme.map(([midi, beat, beats]) => [midi + 12, beat + 96, beats]),
          ...bassRoots.map(([midi, beat, beats]) => [midi, beat + 96, beats]),
        ];
        return [...theme, ...bassRoots, ...buildVariation(32, 1), ...buildVariation(64, 2), ...octaveTheme];
      })(),
    },
    {
      name: "康康舞曲",
      bpm: 145,
      loop: 64,
      // 主题两遍（第二遍高八度），加滚奏低音
      notes: (() => {
        const melody = [
          72, 72, 72, 72, 72, 71, 69, 71, 72, 72, 72, 72, 74, 72, 71, 67,
          72, 72, 72, 72, 72, 71, 69, 71, 74, 74, 74, 74, 76, 74, 72, 71,
          72, 72, 72, 72, 72, 71, 69, 71, 67, 67, 67, 67, 67, 69, 71, 72,
          76, 76, 76, 76, 76, 74, 72, 71, 72, 74, 76, 74, 72, 72, 72, 72,
        ];
        const notes = [];
        melody.forEach((midi, index) => {
          notes.push([midi, index * 0.5, 0.45]);
        });
        // 奥姆-帕低音：每拍根音 + 五度（前半段）
        for (let bar = 0; bar < 16; bar += 1) {
          notes.push([48, bar * 2, 0.45], [55, bar * 2 + 1, 0.45]);
        }
        const octavePass = melody
          .map((midi, index) => [midi + 12, 32 + index * 0.5, 0.45]);
        for (let bar = 16; bar < 32; bar += 1) {
          octavePass.push([36, (bar - 16) * 2 + 32, 0.45], [43, (bar - 16) * 2 + 33, 0.45]);
        }
        return [...notes, ...octavePass];
      })(),
    },
    {
      name: "春之声圆舞曲",
      bpm: 168,
      loop: 51,
      // 华彩引子 → 圆舞曲主题 → 高八度再现
      notes: (() => {
        const notes = [];
        // 引子：上行音阶花腔（第 0 小节）
        [67, 69, 71, 72, 74, 76, 77, 79].forEach((midi, index) => notes.push([midi, index * 0.375, 0.35]));
        // 主题（3/4 拍）：每小节 [和弦根音, [[旋律音, 小节内偏拍, 时值], ...]]
        const bars = [
          [48, [[72, 0, 1], [71, 1, 0.5], [72, 1.5, 0.5]]],
          [43, [[74, 0, 2]]],
          [48, [[76, 0, 1], [74, 1, 0.5], [76, 1.5, 0.5]]],
          [41, [[77, 0, 2]]],
          [43, [[79, 0, 1], [77, 1, 0.5], [76, 1.5, 0.5]]],
          [43, [[74, 0, 2]]],
          [48, [[72, 0, 2], [67, 2, 1]]],
          [48, [[72, 0, 3]]],
        ];
        const pushBar = (barIndex, startBeat, octaveShift) => {
          const [root, melody] = bars[barIndex];
          for (const [midi, offset, beats] of melody) {
            notes.push([midi + octaveShift, startBeat + offset, beats]);
          }
          notes.push([root, startBeat, 1], [root + 12, startBeat + 1, 1], [root + 16, startBeat + 2, 1]);
        };
        // 主题：第 1-8 小节（第 0 小节是引子花腔）
        for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
          pushBar(barIndex, 3 + barIndex * 3, 0);
        }
        // 高八度再现（高潮）：第 9-16 小节
        for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
          pushBar(barIndex, 27 + barIndex * 3, 12);
        }
        return notes;
      })(),
    },
    {
      name: "月光奏鸣曲",
      bpm: 60,
      loop: 16,
      // 三连音背景 + 缓慢下行高音旋律，安静舒缓
      notes: (() => {
        const notes = [];
        for (let beat = 0; beat < 16; beat += 1) {
          const minor = Math.floor(beat / 4) % 2 === 0; // Cm / G7 交替
          const triplet = minor ? [55, 60, 63] : [55, 59, 65];
          triplet.forEach((midi, index) => notes.push([midi, beat + index / 3, 1 / 3]));
        }
        [[36, 0, 4], [43, 4, 4], [36, 8, 4], [43, 12, 4]].forEach(([midi, beat, beats]) => notes.push([midi, beat, beats]));
        [[75, 0, 3], [74, 4, 3], [72, 8, 3], [71, 12, 2], [72, 14, 2]].forEach(([midi, beat, beats]) => notes.push([midi, beat, beats]));
        return notes;
      })(),
    },
  ];

  let musicSelection = "off";
  try { musicSelection = window.localStorage.getItem(MUSIC_STORAGE_KEY) || "off"; } catch (_) { /* 音乐设置是可选的 */ }
  let musicTimer = 0;
  let musicTrackIndex = -1;
  // 已调度未播完的音符，切歌时需要立即淡出，避免上一首继续响。
  const scheduledNotes = [];

  function pianoNote(freq, startAt, duration, volume) {
    // 三角波主体 + 低八度正弦垫底，快起音、指数衰减，接近钢琴的敲击感。
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + Math.max(0.4, duration * 0.95));
    oscillator.connect(gain).connect(masterGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + Math.max(0.4, duration * 0.95) + 0.05);

    const subOscillator = context.createOscillator();
    const subGain = context.createGain();
    subOscillator.type = "sine";
    subOscillator.frequency.value = freq / 2;
    subGain.gain.setValueAtTime(0, startAt);
    subGain.gain.linearRampToValueAtTime(volume * 0.3, startAt + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.0001, startAt + Math.max(0.3, duration * 0.7));
    subOscillator.connect(subGain).connect(masterGain);
    subOscillator.start(startAt);
    subOscillator.stop(startAt + Math.max(0.3, duration * 0.7) + 0.05);

    scheduledNotes.push([oscillator, gain], [subOscillator, subGain]);
    // 播完后从待停列表里移除，避免列表无限增长。
    const prune = () => {
      for (let index = scheduledNotes.length - 1; index >= 0; index -= 1) {
        if (scheduledNotes[index][0] === oscillator) scheduledNotes.splice(index, 1);
      }
    };
    oscillator.onended = prune;
  }

  function scheduleTrackLoop() {
    if (musicTrackIndex < 0) return;
    if (!ensureContext() || context.state !== "running") return;
    const track = TRACKS[musicTrackIndex];
    const secPerBeat = 60 / track.bpm;
    const startAt = now() + 0.08;
    for (const [midi, beat, beats] of track.notes) {
      pianoNote(midiFreq(midi), startAt + beat * secPerBeat, beats * secPerBeat, midi >= 55 ? 0.3 : 0.16);
    }
    musicTimer = window.setTimeout(scheduleTrackLoop, track.loop * secPerBeat * 1000);
  }

  function startMusic() {
    if (musicTimer || musicSelection === "off") return;
    if (!ensureContext()) return;
    musicTrackIndex = Number(musicSelection) % TRACKS.length;
    scheduleTrackLoop();
  }

  function stopMusic() {
    window.clearTimeout(musicTimer);
    musicTimer = 0;
    musicTrackIndex = -1;
    // 立即淡出已调度的音符（60ms 内收干净，避免爆音）。
    const stopAt = context ? now() : 0;
    for (const [oscillator, gain] of scheduledNotes.splice(0)) {
      try {
        gain.gain.cancelScheduledValues(stopAt);
        gain.gain.setTargetAtTime(0, stopAt, 0.02);
        oscillator.stop(stopAt + 0.12);
      } catch (_) { /* 音符可能已自然结束 */ }
    }
  }

  function applyMusicState() {
    const off = musicSelection === "off";
    if (musicIcon) {
      musicIcon.classList.toggle("fa-music", !off);
      musicIcon.classList.toggle("fa-volume-xmark", off);
    }
    if (musicLabel) musicLabel.textContent = off ? "开启音乐" : `♪ ${TRACKS[Number(musicSelection) % TRACKS.length].name}`;
    if (musicButton) musicButton.title = off ? "点按开启背景音乐" : `正在播放：${TRACKS[Number(musicSelection) % TRACKS.length].name}，点按切换下一首`;
    if (off) stopMusic();
    else if (context && context.state === "running") startMusic();
  }

  const PLAYERS = {
    // 放下角色：饱满的"啵咚"一声，两层叠加保证低频有分量
    drop() {
      tone({ type: "triangle", from: 340, to: 190, duration: 0.13, volume: 0.62 });
      tone({ type: "sine", from: 170, to: 95, duration: 0.14, volume: 0.55 });
      tone({ type: "sine", from: 680, to: 380, duration: 0.05, volume: 0.18 });
    },
    // 合成：水泡"咕咚"，角色阶数越高音调越低、音色越厚
    merge({ level = 0 } = {}) {
      const base = 520 - level * 26;
      tone({ type: "sine", from: base, to: base * 0.55, duration: 0.16, volume: 0.45 });
      tone({ type: "sine", from: base * 1.5, to: base * 0.8, start: 0.06, duration: 0.14, volume: 0.25 });
    },
    // 连击：随连击数升高的短琶音
    combo({ count = 3 } = {}) {
      const base = 440;
      const steps = Math.min(count, 6);
      for (let index = 0; index < steps; index += 1) {
        tone({ type: "square", from: base * Math.pow(1.2, index), duration: 0.07, start: index * 0.055, volume: 0.16 });
      }
    },
    // 解锁黄金/至尊角色：小号角
    achievement() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, index) => {
        tone({ type: "triangle", from: freq, duration: index === notes.length - 1 ? 0.34 : 0.13, start: index * 0.12, volume: 0.32 });
      });
    },
    // 合成大肥鱼：加长的胜利号角
    bigfish() {
      const notes = [392, 523, 659, 784, 1047, 1319];
      notes.forEach((freq, index) => {
        tone({ type: "triangle", from: freq, duration: index === notes.length - 1 ? 0.5 : 0.14, start: index * 0.11, volume: 0.36 });
        tone({ type: "sine", from: freq / 2, duration: 0.14, start: index * 0.11, volume: 0.22 });
      });
    },
    // 重锤砸击：低音闷响 + 碎裂噪声
    hammer() {
      tone({ type: "sine", from: 150, to: 55, duration: 0.22, volume: 0.6 });
      noise({ duration: 0.16, volume: 0.42, lowpass: 2200 });
    },
    // 游戏结束：下行三连音
    gameover() {
      const notes = [440, 349, 262];
      notes.forEach((freq, index) => {
        tone({ type: "sine", from: freq, to: freq * 0.92, duration: 0.3, start: index * 0.22, volume: 0.42 });
      });
    },
    // 复活：上扬扫频
    revive() {
      tone({ type: "sine", from: 330, to: 880, duration: 0.4, volume: 0.38 });
      tone({ type: "triangle", from: 660, to: 1320, start: 0.18, duration: 0.3, volume: 0.25 });
    },
    // 面板按钮反馈
    ui() {
      tone({ type: "triangle", from: 660, to: 880, duration: 0.06, volume: 0.18 });
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

  // 音乐按钮：循环切换 关闭 → 致爱丽丝 → 欢乐颂 → 卡农 → 关闭。
  const musicButton = document.getElementById("music-toggle");
  const musicIcon = musicButton?.querySelector("i");
  const musicLabel = musicButton?.querySelector(".utility-label");
  if (musicButton) {
    musicButton.addEventListener("click", () => {
      const order = ["off", "0", "1", "2", "3", "4", "5"];
      const next = order[(order.indexOf(musicSelection) + 1) % order.length];
      musicSelection = next;
      try { window.localStorage.setItem(MUSIC_STORAGE_KEY, musicSelection); } catch (_) { /* 设置是可选的 */ }
      stopMusic();
      if (next !== "off") play("ui"); // 先解锁/恢复音频上下文
      applyMusicState();
    });
    applyMusicState();
  }

  window.FishSound = { play, setMuted, isMuted: () => muted };
})();
