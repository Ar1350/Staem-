(() => {
  "use strict";

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;

  const COLORS = {
    I: "#2ec4ff",
    O: "#ffd166",
    T: "#b388ff",
    S: "#3ecf8e",
    Z: "#ff5d6c",
    J: "#4d7cff",
    L: "#ff9f43",
  };

  const SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  };

  const TYPES = Object.keys(SHAPES);
  const LINE_SCORES = [0, 100, 300, 500, 800];

  const boardCanvas = document.getElementById("board");
  const nextCanvas = document.getElementById("next");
  const boardCtx = boardCanvas.getContext("2d");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const linesEl = document.getElementById("lines");
  const levelEl = document.getElementById("level");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayScore = document.getElementById("overlay-score");
  const restartBtn = document.getElementById("restart-btn");
  const pauseBtn = document.getElementById("pause-btn");

  let grid;
  let bag = [];
  let current;
  let nextType;
  let score;
  let lines;
  let level;
  let dropInterval;
  let dropAccumulator;
  let lastTime;
  let running;
  let paused;
  let gameOver;
  let animId = 0;

  function createGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function nextFromBag() {
    if (bag.length === 0) bag = shuffle([...TYPES]);
    return bag.pop();
  }

  function rotateMatrix(matrix) {
    const size = matrix.length;
    const result = Array.from({ length: size }, () => Array(size).fill(0));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        result[x][size - 1 - y] = matrix[y][x];
      }
    }
    return result;
  }

  function spawnPiece(type) {
    const matrix = SHAPES[type].map((row) => [...row]);
    const x = Math.floor((COLS - matrix[0].length) / 2);
    return { type, matrix, x, y: 0 };
  }

  function collides(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;
        const nx = piece.x + x + offsetX;
        const ny = piece.y + y + offsetY;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function mergePiece() {
    current.matrix.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        const gy = current.y + y;
        const gx = current.x + x;
        if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
          grid[gy][gx] = current.type;
        }
      });
    });
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (grid[y].every((cell) => cell)) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }
    if (cleared > 0) {
      lines += cleared;
      score += LINE_SCORES[cleared] * level;
      level = Math.floor(lines / 10) + 1;
      dropInterval = Math.max(80, 1000 - (level - 1) * 80);
      updateHud();
    }
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
    levelEl.textContent = String(level);
  }

  function drawBlock(ctx, x, y, color, size = BLOCK, alpha = 1) {
    const pad = Math.max(1, size * 0.06);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(x * size + pad, y * size + pad, size - pad * 2, size * 0.28);
    ctx.globalAlpha = 1;
  }

  function ghostY() {
    let y = 0;
    while (!collides(current, 0, y + 1)) y += 1;
    return current.y + y;
  }

  function drawBoard() {
    boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const cell = grid[y][x];
        if (cell) drawBlock(boardCtx, x, y, COLORS[cell]);
      }
    }

    if (current && !gameOver) {
      const gy = ghostY();
      current.matrix.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (!cell) return;
          drawBlock(boardCtx, current.x + x, gy + y, COLORS[current.type], BLOCK, 0.22);
        });
      });

      current.matrix.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (!cell) return;
          const py = current.y + y;
          if (py >= 0) drawBlock(boardCtx, current.x + x, py, COLORS[current.type]);
        });
      });
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextType) return;
    const matrix = SHAPES[nextType];
    const size = 24;
    const offsetX = (nextCanvas.width / size - matrix[0].length) / 2;
    const offsetY = (nextCanvas.height / size - matrix.length) / 2;
    matrix.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        drawBlock(nextCtx, offsetX + x, offsetY + y, COLORS[nextType], size);
      });
    });
  }

  function spawnNext() {
    current = spawnPiece(nextType);
    nextType = nextFromBag();
    drawNext();
    if (collides(current)) {
      endGame();
    }
  }

  function hardDrop() {
    if (!running || paused || gameOver) return;
    let dropped = 0;
    while (!collides(current, 0, 1)) {
      current.y += 1;
      dropped += 1;
    }
    score += dropped * 2;
    lockPiece();
    updateHud();
  }

  function softDrop() {
    if (!running || paused || gameOver) return;
    if (!collides(current, 0, 1)) {
      current.y += 1;
      score += 1;
      updateHud();
      dropAccumulator = 0;
    } else {
      lockPiece();
    }
  }

  function move(dx) {
    if (!running || paused || gameOver) return;
    if (!collides(current, dx, 0)) current.x += dx;
  }

  function rotate() {
    if (!running || paused || gameOver) return;
    if (current.type === "O") return;
    const rotated = rotateMatrix(current.matrix);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collides(current, kick, 0, rotated)) {
        current.matrix = rotated;
        current.x += kick;
        return;
      }
    }
  }

  function lockPiece() {
    mergePiece();
    clearLines();
    spawnNext();
  }

  function tickDrop() {
    if (!collides(current, 0, 1)) {
      current.y += 1;
    } else {
      lockPiece();
    }
  }

  function loop(time) {
    if (!running) return;
    const delta = time - lastTime;
    lastTime = time;

    if (!paused && !gameOver) {
      dropAccumulator += delta;
      while (dropAccumulator >= dropInterval) {
        dropAccumulator -= dropInterval;
        tickDrop();
      }
    }

    drawBoard();
    animId = requestAnimationFrame(loop);
  }

  function showOverlay(title, detail, { showRestart = false } = {}) {
    overlayTitle.textContent = title;
    overlayScore.textContent = detail;
    restartBtn.classList.toggle("hidden", !showRestart);
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function endGame() {
    gameOver = true;
    running = false;
    pauseBtn.textContent = "暂停";
    showOverlay("游戏结束", `得分 ${score}`, { showRestart: true });
    cancelAnimationFrame(animId);
    drawBoard();
  }

  function togglePause() {
    if (gameOver || !running) return;
    paused = !paused;
    pauseBtn.textContent = paused ? "继续" : "暂停";
    if (paused) {
      showOverlay("已暂停", "按 P 或按钮继续", { showRestart: false });
    } else {
      hideOverlay();
      lastTime = performance.now();
    }
  }

  function resetGame() {
    cancelAnimationFrame(animId);
    grid = createGrid();
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    dropAccumulator = 0;
    paused = false;
    gameOver = false;
    running = true;
    pauseBtn.textContent = "暂停";
    nextType = nextFromBag();
    spawnNext();
    updateHud();
    hideOverlay();
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }

  function onKey(e) {
    const key = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(key)) {
      e.preventDefault();
    }

    if (key === "p" || key === "P") {
      if (gameOver) return;
      if (!running) return;
      togglePause();
      return;
    }

    if (gameOver || paused) return;

    switch (key) {
      case "ArrowLeft":
        move(-1);
        break;
      case "ArrowRight":
        move(1);
        break;
      case "ArrowDown":
        softDrop();
        break;
      case "ArrowUp":
      case "x":
      case "X":
        rotate();
        break;
      case " ":
        hardDrop();
        break;
      default:
        break;
    }
  }

  document.querySelectorAll(".touch-controls [data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    const fire = () => {
      if (action === "left") move(-1);
      else if (action === "right") move(1);
      else if (action === "rotate") rotate();
      else if (action === "soft") softDrop();
      else if (action === "hard") hardDrop();
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fire();
    });
  });

  restartBtn.addEventListener("click", resetGame);
  pauseBtn.addEventListener("click", togglePause);
  window.addEventListener("keydown", onKey);

  resetGame();
})();
