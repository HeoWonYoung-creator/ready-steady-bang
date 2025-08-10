(() => {
  // 상태
  const Scene = {
    Title: 'title',
    Mode: 'mode',
    Game: 'game',
    Result: 'result',
  };

  const state = {
    scene: Scene.Title,
    targetScore: 3,
    scores: { p1: 0, p2: 0 },
    // 한 라운드용
    round: {
      readyAt: 0,
      bangAt: 0,
      fired: { p1: false, p2: false },
      prefired: { p1: false, p2: false },
      reaction: { p1: [], p2: [] },
      best: { p1: Infinity, p2: Infinity },
      canFire: false,
      resolved: false,
      missPlaced: false,
      timers: { steady: null, bang: null },
      inputLocked: false,
    },
  };

  // 엘리먼트
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const sceneTitle = $('#scene-title');
  const sceneMode = $('#scene-mode');
  const sceneGame = $('#scene-game');
  const sceneResult = $('#scene-result');

  const modeOptions = $('#mode-options');
  const targetScoreEl = $('#target-score');
  const scoreP1 = $('#score-p1');
  const scoreP2 = $('#score-p2');

  const imgP1 = $('#img-p1');
  const imgP2 = $('#img-p2');
  const missOverlay = document.getElementById('miss-overlay');
  const centerText = $('#center-text');
  // ambient weed removed

  const resultTitle = $('#result-title');
  const resScoreP1 = $('#res-score-p1');
  const resScoreP2 = $('#res-score-p2');
  const avgP1 = $('#avg-p1');
  const avgP2 = $('#avg-p2');
  const bestP1 = $('#best-p1');
  const bestP2 = $('#best-p2');

  function setScene(name) {
    state.scene = name;
    [sceneTitle, sceneMode, sceneGame, sceneResult].forEach((s) => s.classList.remove('active'));
    if (name === Scene.Title) sceneTitle.classList.add('active');
    if (name === Scene.Mode) sceneMode.classList.add('active');
    if (name === Scene.Game) sceneGame.classList.add('active');
    if (name === Scene.Result) sceneResult.classList.add('active');
  }

  function resetRoundVisuals() {
    imgP1.src = 'idle.png';
    imgP2.src = 'idle.png';
    centerText.textContent = '';
    centerText.classList.remove('announce', 'bang-sign');
    // blood marks persist like miss; do not clear
    // crowns removed
  }

  function clearRoundTimers() {
    if (state.round.timers?.steady) {
      clearTimeout(state.round.timers.steady);
      state.round.timers.steady = null;
    }
    if (state.round.timers?.bang) {
      clearTimeout(state.round.timers.bang);
      state.round.timers.bang = null;
    }
  }

  function resetRoundState() {
    clearRoundTimers();
    state.round.readyAt = performance.now();
    state.round.bangAt = 0;
    state.round.fired = { p1: false, p2: false };
    state.round.prefired = { p1: false, p2: false };
    state.round.canFire = false;
    state.round.resolved = false;
    state.round.missPlaced = false;
    state.round.timers = { steady: null, bang: null };
    state.round.inputLocked = false;
  }

  function startMatch() {
    state.scores = { p1: 0, p2: 0 };
    scoreP1.textContent = '0';
    scoreP2.textContent = '0';
    targetScoreEl.textContent = String(state.targetScore);
    // 매치 시작 시 반응 속도 기록/최고 기록 초기화
    state.round.reaction = { p1: [], p2: [] };
    state.round.best = { p1: Infinity, p2: Infinity };
    setScene(Scene.Game);
    nextRound();
  }

  function nextRound() {
    resetRoundVisuals();
    resetRoundState();
    // READY-STEADY 표시 순서 후 랜덤 딜레이로 BANG
    imgP1.src = 'ready.png';
    imgP2.src = 'ready.png';
    announceText('READY');
    Sound.playReady();
    state.round.timers.steady = setTimeout(() => {
      announceText('STEADY');
      Sound.playSteady();
      const randomDelay = 2000 + Math.random() * 3000; // 2.0 ~ 5.0s (STEADY → BANG 최소 2초)
      state.round.timers.bang = setTimeout(() => {
        if (state.round.resolved) return; // 이미 무효(예: DRAW)면 중단
        state.round.canFire = true;
        state.round.bangAt = performance.now();
        centerText.textContent = 'BANG!';
        centerText.classList.remove('announce');
        void centerText.offsetWidth;
        centerText.classList.add('announce', 'bang-sign');
        // 사인 표시 사운드
        const el = document.getElementById('sfx-sign');
        if (el && el.play) { try { el.currentTime = 0; el.play(); } catch(_){} }
      }, randomDelay);
    }, 1500);
  }

  function announceText(text) {
    centerText.textContent = text;
    centerText.classList.remove('announce', 'bang-sign');
    // reflow to restart animation
    void centerText.offsetWidth;
    centerText.classList.add('announce');
  }

  // 간단한 사운드 매니저 (WebAudio 합성)
  const Sound = (() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      unlocked = true;
      // HTML 오디오 엘리먼트도 재생 가능하도록 한 번 무음 호출
      [document.getElementById('sfx-ready'), document.getElementById('sfx-steady'), document.getElementById('sfx-bang'), document.getElementById('sfx-miss')]
        .forEach((el) => { try { el && el.play && el.pause(); } catch(_){} });
    };

    const beep = (freq = 440, durationMs = 120, type = 'sine', gain = 0.05) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.value = gain;
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    };

    const click = (durationMs = 40, gain = 0.07) => {
      const buffer = ctx.createBuffer(1, 4410, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 500);
      }
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = gain;
      src.buffer = buffer;
      src.connect(g).connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + durationMs / 1000 + 0.02);
    };

    // 사운드 프리셋
    const playReady = () => {
      const el = document.getElementById('sfx-ready');
      if (el && el.play) { try { el.currentTime = 0; el.play(); return; } catch(_){} }
      beep(392, 120, 'square');
    };
    const playSteady = () => {
      const el = document.getElementById('sfx-steady');
      if (el && el.play) { try { el.currentTime = 0; el.play(); return; } catch(_){} }
      beep(440, 120, 'square');
    };
    const playBang = () => {
      const el = document.getElementById('sfx-bang');
      if (el && el.play) { try { el.currentTime = 0; el.play(); return; } catch(_){} }
      click(60, 0.12); beep(220, 90, 'sawtooth', 0.04);
    };
    const playMiss = () => {
      const el = document.getElementById('sfx-miss');
      if (el && el.play) { try { el.currentTime = 0; el.play(); return; } catch(_){} }
      beep(196, 200, 'triangle', 0.03);
    };
    const playHit = () => { click(70, 0.16); };
    const playWin = () => { beep(523, 140, 'square'); setTimeout(() => beep(659, 180, 'square'), 140); };
    const playLose = () => { beep(196, 220, 'sine', 0.03); };

    // 사용자 첫 상호작용에 오디오 컨텍스트 언락
    ['pointerdown', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlock, { once: true });
    });

    return { playReady, playSteady, playBang, playMiss, playHit, playWin, playLose };
  })();

  function endRound(winner) {
    if (state.round.resolved) return;
    state.round.resolved = true;

    if (winner === 'p1') state.scores.p1 += 1;
    if (winner === 'p2') state.scores.p2 += 1;
    scoreP1.textContent = String(state.scores.p1);
    scoreP2.textContent = String(state.scores.p2);

    const reached = state.scores.p1 >= state.targetScore || state.scores.p2 >= state.targetScore;
    setTimeout(() => {
      if (reached) {
        showResult();
      } else {
        nextRound();
      }
    }, 3000);
  }

  function placeMiss(panel) {
    // miss 이미지는 플레이 영역 뒤쪽(씬 전체)에 넓게 랜덤 배치
    const dot = document.createElement('div');
    dot.className = 'miss-dot';
    // 패널에 따라 대략 왼/오 우세 영역 설정하되, 넓게 분포
    const leftMin = panel === 'left' ? -5 : 50;
    const leftMax = panel === 'left' ? 40 : 110;
    const topMin = -10; // 위로도 퍼지게
    const topMax = 90;  // 아래로도 퍼지게
    const x = Math.random() * (leftMax - leftMin) + leftMin;
    const y = Math.random() * (topMax - topMin) + topMin;
    dot.style.left = x + '%';
    dot.style.top = y + '%';
    dot.style.setProperty('--rot', Math.round(Math.random() * 360) + 'deg');
    const img = new Image();
    img.onload = () => {
      dot.style.background = 'transparent';
      dot.style.border = 'none';
      dot.style.width = '64px';
      dot.style.height = '64px';
      dot.textContent = '';
      img.style.width = '64px';
      img.style.height = '64px';
      img.style.position = 'absolute';
      img.style.left = '0';
      img.style.top = '0';
      dot.appendChild(img);
    };
    img.onerror = () => { dot.textContent = 'MISS'; };
    img.src = 'miss.png';
    if (missOverlay) missOverlay.appendChild(dot);
  }

  function placeBlood(panel) {
    const scene = document.getElementById('scene-game');
    if (!scene || !missOverlay) return;
    const imgEl = panel === 'left' ? imgP1 : imgP2;
    if (!imgEl) return;
    const sceneRect = scene.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();
    const dot = document.createElement('img');
    dot.src = 'blood.png';
    dot.alt = 'blood';
    dot.className = 'blood-dot';
    // X: 캐릭터 뒤쪽 라인 (P1=이미지의 왼쪽, P2=이미지의 오른쪽)
    const baseX = panel === 'left' ? imgRect.left : imgRect.right;
    const offsetX = panel === 'right' ? 220 : 0; // P2 더 뒤로 +20
    const xPx = baseX - sceneRect.left + offsetX;
    // Y: 캐릭터 높이 구간 중 아래쪽 절반에서 랜덤 (바닥선 부근까지)
    const yMin = imgRect.top + imgRect.height * 0.45 - sceneRect.top;
    const yMax = imgRect.bottom - 8 - sceneRect.top;
    const yPx = yMin + Math.random() * Math.max(4, yMax - yMin);
    dot.style.left = xPx + 'px';
    dot.style.top = yPx + 'px';
    missOverlay.appendChild(dot);
  }

  function handleFire(player) {
    if (state.round.resolved) return;
    const now = performance.now();

    // 아직 BANG 이전 → 파울(프리파이어)
    if (!state.round.canFire) {
      if (!state.round.prefired[player]) {
        // 상대 영역에 miss 표시 & 해당 플레이어는 탄을 소모한 것으로 처리
        placeMiss(player === 'p1' ? 'right' : 'left');
        state.round.prefired[player] = true;
        state.round.fired[player] = true;
        // 미스한 플레이어도 발사 모션은 유지
        if (player === 'p1') {
          imgP1.src = 'bang.png';
        } else {
          imgP2.src = 'bang.png';
        }
        Sound.playMiss();
      }
      // 둘 다 프리파이어 했다면 무승부 처리
      if (state.round.prefired.p1 && state.round.prefired.p2) {
        state.round.resolved = true;
        state.round.inputLocked = true;
        centerText.textContent = 'DRAW';
        announceText('DRAW');
        clearRoundTimers();
        setTimeout(() => {
          nextRound();
        }, 3000);
      }
      return;
    }

    // BANG 이후 → 프리파이어한 플레이어는 더 이상 발사 불가
    if (state.round.prefired[player]) {
      return;
    }

    // BANG 이후 → 반응속도 기록
    if (!state.round.fired[player]) {
      state.round.fired[player] = true;
      const reaction = Math.max(0, Math.round(now - state.round.bangAt));
      state.round.reaction[player].push(reaction);
      state.round.best[player] = Math.min(state.round.best[player], reaction);
    }

    // 두 명 중 먼저 맞춘 사람을 승자로 결정
    // 프리파이어가 있었으면 프리파이어가 아닌 쪽이 유리: 해당 쪽이 쏘는 즉시 승리
    let winner = null;
    if (state.round.prefired.p1 && !state.round.prefired.p2) {
      winner = 'p2';
    } else if (state.round.prefired.p2 && !state.round.prefired.p1) {
      winner = 'p1';
    } else {
      // 이번 라운드에서 실제 발사(프리파이어 제외)한 경우에만 시간을 비교
      const p1Time = (state.round.fired.p1 && !state.round.prefired.p1)
        ? state.round.reaction.p1[state.round.reaction.p1.length - 1]
        : Infinity;
      const p2Time = (state.round.fired.p2 && !state.round.prefired.p2)
        ? state.round.reaction.p2[state.round.reaction.p2.length - 1]
        : Infinity;
      if (p1Time === Infinity && p2Time === Infinity) return;
      winner = p1Time <= p2Time ? 'p1' : 'p2';
    }
    // Lock inputs immediately for the rest of this round
    state.round.inputLocked = true;
    state.round.canFire = false;

    const loserImg = winner === 'p1' ? imgP2 : imgP1;
    const winnerImg = winner === 'p1' ? imgP1 : imgP2;

    centerText.textContent = 'BANG!';
    winnerImg.src = 'bang.png';
    setTimeout(() => {
      loserImg.src = 'hit.png';
      // Blood mark in background overlay near loser side (does not affect layout)
      placeBlood(winner === 'p1' ? 'right' : 'left');
      setTimeout(() => {
        loserImg.src = 'lose.png';
        winnerImg.src = 'win.png';
        endRound(winner);
      }, 250);
    }, 120);
    Sound.playBang();
  }

  function average(arr) {
    if (!arr.length) return NaN;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  function showResult() {
    // 게임 종료 시 누적된 blood/miss 오버레이 정리
    if (missOverlay) missOverlay.innerHTML = '';
    setScene(Scene.Result);
    const p1Wins = state.scores.p1;
    const p2Wins = state.scores.p2;
    resScoreP1.textContent = String(p1Wins);
    resScoreP2.textContent = String(p2Wins);

    // 전체 반응 기록 합산
    const allP1 = state.round.reaction.p1; // 이번 매치에서 누적해왔음
    const allP2 = state.round.reaction.p2;
    avgP1.textContent = isNaN(average(allP1)) ? '-' : String(average(allP1));
    avgP2.textContent = isNaN(average(allP2)) ? '-' : String(average(allP2));
    bestP1.textContent = state.round.best.p1 === Infinity ? '-' : String(state.round.best.p1);
    bestP2.textContent = state.round.best.p2 === Infinity ? '-' : String(state.round.best.p2);

    const p1Win = p1Wins > p2Wins;
    const p2Win = p2Wins > p1Wins;
    resultTitle.textContent = p1Win ? 'Player 1 Wins!' : p2Win ? 'Player 2 Wins!' : 'Draw';
    if (p1Win || p2Win) Sound.playWin(); else Sound.playLose();

    // crowns removed
  }

  // 입력 처리
  function moveModeSelection(dir) {
    const items = Array.from(modeOptions.querySelectorAll('li'));
    let idx = items.findIndex((el) => el.classList.contains('selected'));
    if (idx < 0) idx = 1; // 기본 3점 항목
    idx = (idx + dir + items.length) % items.length;
    items.forEach((el) => el.classList.remove('selected'));
    items[idx].classList.add('selected');
  }

  function confirmModeSelection() {
    const selected = modeOptions.querySelector('li.selected');
    state.targetScore = Number(selected.dataset.target || '3');
    startMatch();
  }

  // 이벤트 바인딩 (Title: Space로만 시작)

  document.addEventListener('keydown', (e) => {
    if (state.scene === Scene.Title) {
      if (e.code === 'Space') setScene(Scene.Mode);
      return;
    }
    if (state.scene === Scene.Mode) {
      if (e.code === 'ArrowUp') moveModeSelection(-1);
      if (e.code === 'ArrowDown') moveModeSelection(1);
      if (e.code === 'Space') confirmModeSelection();
      if (e.code === 'Escape') setScene(Scene.Title);
      return;
    }
    if (state.scene === Scene.Game) {
      // 라운드 종료 대기 중에는 어떤 입력도 무시
      if (state.round.inputLocked) return;
      // 좌/우 Ctrl 판별: KeyboardEvent의 location 사용
      if (e.code === 'ControlLeft' || (e.key === 'Control' && e.location === 1)) {
        handleFire('p1');
      }
      if (e.code === 'ControlRight' || (e.key === 'Control' && e.location === 2)) {
        handleFire('p2');
      }
      if (e.code === 'Escape') {
        // 게임 중 ESC → 타이틀로 즉시 이동 (타이머/입력 정리)
        state.round.inputLocked = true;
        state.round.canFire = false;
        clearRoundTimers();
        setScene(Scene.Title);
        return;
      }
      return;
    }
    if (state.scene === Scene.Result) {
      if (e.code === 'Space') {
        // 결과에서 Space → 재시작(모드 유지)
        startMatch();
      }
      if (e.code === 'Escape') setScene(Scene.Title);
    }
  });

  // 마우스로도 모드 선택 클릭 가능하게
  modeOptions.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    modeOptions.querySelectorAll('li').forEach((el) => el.classList.remove('selected'));
    li.classList.add('selected');
    confirmModeSelection();
  });

  // weed logic removed
})();


