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

// Обработка жестов
hands.onResults((results) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // Получаем большой палец (точка 4) и указательный (точка 8)
    const thumb = landmarks[4];
    const index = landmarks[8];

    const dx = (thumb.x - index.x) * canvas.width;
    const dy = (thumb.y - index.y) * canvas.height;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Если пальцы близко -> ✌️ или 👍
    if (distance < 50) {
      showEffect("👍");
    } else {
      hideEffect();
    }

    // Нарисуем точки
    ctx.fillStyle = "rgba(0,255,255,0.7)";
    for (let point of landmarks) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
});

function showEffect(symbol) {
  effect.innerText = symbol;
  effect.style.display = "block";
}

function hideEffect() {
  effect.style.display = "none";
}
