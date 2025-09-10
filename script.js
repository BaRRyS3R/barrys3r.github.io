const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const effect = document.getElementById("effect");

// Инициализация камеры
async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" }, // фронтальная камера
    audio: false,
  });
  video.srcObject = stream;
}
initCamera();

// Подключаем MediaPipe Hands
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});

// Камера MediaPipe
const camera = new Camera(video, {
  onFrame: async () => {
    await hands.send({ image: video });
  },
  width: 640,
  height: 480,
});
camera.start();

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let portalRadius = 0;
let portalActive = false;

// Обработка результатов
hands.onResults((results) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // Берем несколько точек
    const thumb = landmarks[4]; // большой палец
    const index = landmarks[8]; // указательный
    const middle = landmarks[12]; // средний
    const ring = landmarks[16]; // безымянный
    const pinky = landmarks[20]; // мизинец

    // Проверка расстояний
    const dx = (thumb.x - index.x) * canvas.width;
    const dy = (thumb.y - index.y) * canvas.height;
    const distanceThumbIndex = Math.sqrt(dx * dx + dy * dy);

    const distanceIndexMiddle =
      Math.abs(index.y - middle.y) * canvas.height;

    const fistClosed =
      distanceThumbIndex < 50 &&
      Math.abs(index.y - ring.y) * canvas.height < 40 &&
      Math.abs(index.y - pinky.y) * canvas.height < 40;

    // 👍 (большой + указательный близко)
    if (distanceThumbIndex < 50) {
      showEffect("👍");
    }
    // ✌️ (указательный и средний подняты, расстояние между ними большое)
    else if (index.y < landmarks[6].y && middle.y < landmarks[10].y && distanceIndexMiddle > 60) {
      neonFlash();
    }
    // 👊 (кулак)
    else if (fistClosed) {
      activatePortal();
    } else {
      hideEffect();
      portalActive = false;
    }

    // Рисуем точки для дебага
    ctx.fillStyle = "rgba(0,255,255,0.5)";
    for (let point of landmarks) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // Рисуем портал, если активен
  if (portalActive) {
    drawPortal();
  }
});

// 👍
function showEffect(symbol) {
  effect.innerText = symbol;
  effect.style.display = "block";
}

// Скрыть эффект
function hideEffect() {
  effect.style.display = "none";
}

// ✌️ — неоновая вспышка
function neonFlash() {
  ctx.fillStyle = "rgba(0, 255, 200, 0.3)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  effect.innerText = "✌️";
  effect.style.display = "block";
}

// 👊 — портал
function activatePortal() {
  portalActive = true;
  portalRadius = 10;
  effect.innerText = "👊";
  effect.style.display = "block";
}

function drawPortal() {
  portalRadius += 5;
  if (portalRadius > 200) portalRadius = 10;

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, portalRadius, 0, 2 * Math.PI);
  ctx.strokeStyle = `rgba(0,150,255,${1 - portalRadius / 200})`;
  ctx.lineWidth = 4;
  ctx.stroke();
}
