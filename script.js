(() => {
  const RING_CIRCUMFERENCE = 2 * Math.PI * 90;

  const modeButtons = document.querySelectorAll(".mode-btn");
  const timeDisplay = document.getElementById("timeDisplay");
  const statusText = document.getElementById("statusText");
  const ringProgress = document.getElementById("ringProgress");
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  const skipBtn = document.getElementById("skipBtn");
  const taskForm = document.getElementById("taskForm");
  const taskInput = document.getElementById("taskInput");
  const taskList = document.getElementById("taskList");
  const sessionCountEl = document.getElementById("sessionCount");

  const MODE_COLORS = { focus: "#6ee7b7", short: "#7fb2ff", long: "#f6a86b" };
  const MODE_LABELS = {
    focus: "集中する準備はいいですか?",
    short: "少し休みましょう",
    long: "しっかり休みましょう",
  };

  const state = {
    mode: "focus",
    totalSeconds: 25 * 60,
    remaining: 25 * 60,
    running: false,
    intervalId: null,
    sessionCount: Number(localStorage.getItem("ft_sessionCount") || 0),
  };

  ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function render() {
    timeDisplay.textContent = formatTime(state.remaining);
    const fraction = state.remaining / state.totalSeconds;
    ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
    ringProgress.style.stroke = MODE_COLORS[state.mode];
    startBtn.textContent = state.running ? "一時停止" : "開始";
    startBtn.classList.toggle("running", state.running);
    sessionCountEl.textContent = `完了: ${state.sessionCount} セッション`;
    document.title = `${formatTime(state.remaining)} - フォーカスタイマー`;
  }

  function setMode(mode, minutes) {
    state.mode = mode;
    state.totalSeconds = minutes * 60;
    state.remaining = minutes * 60;
    state.running = false;
    clearInterval(state.intervalId);
    statusText.textContent = MODE_LABELS[mode];
    modeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
    render();
  }

  function tick() {
    state.remaining -= 1;
    if (state.remaining <= 0) {
      state.remaining = 0;
      render();
      completeSession();
      return;
    }
    render();
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [880, 1108, 1318];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.55);
      });
    } catch (e) {
      /* audio not available */
    }
  }

  function notify(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }

  function completeSession() {
    clearInterval(state.intervalId);
    state.running = false;
    playChime();

    if (state.mode === "focus") {
      state.sessionCount += 1;
      localStorage.setItem("ft_sessionCount", String(state.sessionCount));
      const activeTask = taskList.querySelector(".task-item.active-task");
      if (activeTask) {
        const pomosEl = activeTask.querySelector(".task-pomos");
        const current = Number(activeTask.dataset.pomos || 0) + 1;
        activeTask.dataset.pomos = String(current);
        pomosEl.textContent = `🍅 ${current}`;
        saveTasks();
      }
      notify("集中セッション完了!", "お疲れさまでした。休憩しましょう。");
      const nextIsLong = state.sessionCount % 4 === 0;
      const nextBtn = document.querySelector(
        `.mode-btn[data-mode="${nextIsLong ? "long" : "short"}"]`
      );
      setMode(nextBtn.dataset.mode, Number(nextBtn.dataset.min));
    } else {
      notify("休憩終了", "次の集中セッションを始めましょう。");
      const focusBtn = document.querySelector('.mode-btn[data-mode="focus"]');
      setMode("focus", Number(focusBtn.dataset.min));
    }
    render();
  }

  function toggleStart() {
    state.running = !state.running;
    if (state.running) {
      if (Notification && Notification.permission === "default") {
        Notification.requestPermission();
      }
      state.intervalId = setInterval(tick, 1000);
    } else {
      clearInterval(state.intervalId);
    }
    render();
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setMode(btn.dataset.mode, Number(btn.dataset.min));
    });
  });

  startBtn.addEventListener("click", toggleStart);

  resetBtn.addEventListener("click", () => {
    state.running = false;
    clearInterval(state.intervalId);
    state.remaining = state.totalSeconds;
    render();
  });

  skipBtn.addEventListener("click", () => {
    completeSession();
  });

  // --- Tasks ---
  function loadTasks() {
    try {
      return JSON.parse(localStorage.getItem("ft_tasks") || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveTasks() {
    const tasks = [...taskList.querySelectorAll(".task-item")].map((item) => ({
      text: item.querySelector(".task-label").textContent,
      done: item.classList.contains("done"),
      pomos: Number(item.dataset.pomos || 0),
    }));
    localStorage.setItem("ft_tasks", JSON.stringify(tasks));
  }

  function updateActiveTask() {
    const items = [...taskList.querySelectorAll(".task-item")];
    items.forEach((item) => item.classList.remove("active-task"));
    const firstUndone = items.find((item) => !item.classList.contains("done"));
    if (firstUndone) firstUndone.classList.add("active-task");
  }

  function createTaskItem({ text, done = false, pomos = 0 }) {
    const li = document.createElement("li");
    li.className = "task-item" + (done ? " done" : "");
    li.dataset.pomos = String(pomos);

    const check = document.createElement("button");
    check.className = "task-check";
    check.type = "button";
    check.addEventListener("click", () => {
      li.classList.toggle("done");
      updateActiveTask();
      saveTasks();
    });

    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = text;
    label.addEventListener("click", () => check.click());

    const pomosEl = document.createElement("span");
    pomosEl.className = "task-pomos";
    pomosEl.textContent = pomos > 0 ? `🍅 ${pomos}` : "";

    const del = document.createElement("button");
    del.className = "task-del";
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      li.remove();
      updateActiveTask();
      saveTasks();
    });

    li.append(check, label, pomosEl, del);
    return li;
  }

  taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;
    const item = createTaskItem({ text });
    taskList.appendChild(item);
    taskInput.value = "";
    updateActiveTask();
    saveTasks();
  });

  loadTasks().forEach((task) => taskList.appendChild(createTaskItem(task)));
  updateActiveTask();

  setMode("focus", 25);
})();
