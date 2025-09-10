const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const effect = document.getElementById("effect");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Включаем фронтальную камеру
async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
}
initCamera();

// MediaPipe Hands
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
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

// Обработка результатов
hands.onResults((results) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // Рисуем руку (линии и точки)
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
      color: "#00ffff",
      lineWidth: 4,
    });
    drawLandmarks(ctx, landmarks, { color: "#ff00ff", lineWidth: 2 });

    // Жесты
    detectGestures(landmarks);
  } else {
    hideEffect();
  }
});

// === Жесты ===
function detectGestures(landmarks) {
  const thumb = landmarks[4];   // большой
  const index = landmarks[8];   // указательный
  const middle = landmarks[12]; // средний
  const ring = landmarks[16];   // безымянный
  const pinky = landmarks[20];  // мизинец

  const dx = (thumb.x - index.x) * canvas.width;
  const dy = (thumb.y - index.y) * canvas.height;
  const distanceThumbIndex = Math.sqrt(dx * dx + dy * dy);

  // 👍 — большой и указательный вместе
  if (distanceThumbIndex < 50) {
    showEffect("👍");
  }
  // ✌️ — указательный и средний подняты
  else if (index.y < landmarks[6].y && middle.y < landmarks[10].y) {
    showEffect("✌️");
  }
  // 👊 — кулак (все пальцы низко)
  else if (
    index.y > landmarks[6].y &&
    middle.y > landmarks[10].y &&
    ring.y > landmarks[14].y &&
    pinky.y > landmarks[18].y
  ) {
    showEffect("👊");
  } else {
    hideEffect();
  }
}

function showEffect(symbol) {
  effect.innerText = symbol;
  effect.style.display = "block";
}

function hideEffect() {
  effect.style.display = "none";
}
