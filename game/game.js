// Подключение к WebSocket серверу
const ws = new WebSocket('ws://localhost:3000');

// Matter.js модули
const Engine = Matter.Engine;
const Render = Matter.Render;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Events = Matter.Events;

// Игровые переменные
let engine, render, canvas;
let myPlayerId = null;
let myPlayer = null;
let isShaman = false;
let players = {};
let playerBodies = {}; // Отдельное хранилище для Matter.js тел
let playerStates = {}; // Буфер состояний для интерполяции
let cheese = null;
let hole = null;
let platforms = [];
let keys = {};
let jumpCount = 0; // Счётчик использованных прыжков
let canJump = false;
let touchingWall = false; // Для wall-jump
let lastWallSide = null; // 'left' или 'right'
let cheeseReached = false; // Флаг для предотвращения множественной отправки

// Границы мира
let ground, leftWall, rightWall, ceiling;

// Динамические константы (будут обновляться при ресайзе)
let CANVAS_WIDTH = window.innerWidth;
let CANVAS_HEIGHT = window.innerHeight;
const PLAYER_SIZE = 20;
const MOVE_SPEED = 3;
const JUMP_FORCE = -10;
const DOUBLE_JUMP_FORCE = -9.5;
const WALL_JUMP_FORCE = -9;
const WALL_JUMP_PUSH = 4;
const MAX_JUMPS = 2;

// Настройки lag-compensation
const INTERPOLATION_DELAY = 100; // мс задержки для интерполяции
const BUFFER_SIZE = 10; // Размер буфера состояний
const LERP_FACTOR = 0.3; // Скорость интерполяции (0-1, чем больше - тем быстрее)

// Измерение пинга
let pingStartTime = 0;
let currentPing = 0;
let pingInterval = null;

// Мобильное управление
let isMobile = false;
let mobileControls = {
    left: false,
    right: false,
    jump: false
};

// Инициализация игры
function init() {
    canvas = document.getElementById('gameCanvas');
    
    // Определяем мобильное устройство и включаем кнопки
    detectMobileDevice();
    
    // Устанавливаем размер canvas
    updateCanvasSize();
    
    // Создаем физический движок
    engine = Engine.create();
    engine.world.gravity.y = 1;
    
    render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            wireframes: false,
            background: '#87CEEB'
        }
    });
    
    // Создаем границы мира
    createWorldBounds();
    
    // Проверка коллизий
    Events.on(engine, 'collisionStart', onCollisionStart);
    Events.on(engine, 'collisionEnd', onCollisionEnd);
    
    // Обработка физики каждый кадр
    Events.on(engine, 'beforeUpdate', () => {
        if (myPlayer) {
            updatePlayer();
            checkCollisions();
        }
        // Обновляем других игроков с интерполяцией
        updateOtherPlayers();
    });
    
    // Запускаем движок и рендер
    Engine.run(engine);
    Render.run(render);
    
    // Обработчики событий
    setupEventHandlers();
    
    // Обработка изменения размера окна
    window.addEventListener('resize', handleResize);
}

// Обновление размера canvas
function updateCanvasSize() {
    CANVAS_WIDTH = window.innerWidth;
    CANVAS_HEIGHT = window.innerHeight;
    
    if (canvas) {
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
    }
    
    // Обновляем индикатор размера экрана
    const screenDimensions = document.getElementById('screen-dimensions');
    if (screenDimensions) {
        screenDimensions.textContent = `${CANVAS_WIDTH}x${CANVAS_HEIGHT}`;
    }
}

// Создание границ мира
function createWorldBounds() {
    // Удаляем старые границы если они есть
    if (ground) {
        World.remove(engine.world, [ground, leftWall, rightWall, ceiling]);
    }
    
    ground = Bodies.rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 10, CANVAS_WIDTH, 20, { 
        isStatic: true,
        render: { fillStyle: '#8B4513' },
        label: 'ground'
    });
    
    leftWall = Bodies.rectangle(10, CANVAS_HEIGHT / 2, 20, CANVAS_HEIGHT, { 
        isStatic: true,
        render: { fillStyle: '#8B4513' },
        label: 'leftWall'
    });
    
    rightWall = Bodies.rectangle(CANVAS_WIDTH - 10, CANVAS_HEIGHT / 2, 20, CANVAS_HEIGHT, { 
        isStatic: true,
        render: { fillStyle: '#8B4513' },
        label: 'rightWall'
    });
    
    ceiling = Bodies.rectangle(CANVAS_WIDTH / 2, 10, CANVAS_WIDTH, 20, { 
        isStatic: true,
        render: { fillStyle: '#8B4513' }
    });
    
    World.add(engine.world, [ground, leftWall, rightWall, ceiling]);
}

// Обработка изменения размера окна
function handleResize() {
    const oldWidth = CANVAS_WIDTH;
    const oldHeight = CANVAS_HEIGHT;
    
    updateCanvasSize();
    
    // Обновляем размеры рендера
    render.canvas.width = CANVAS_WIDTH;
    render.canvas.height = CANVAS_HEIGHT;
    render.options.width = CANVAS_WIDTH;
    render.options.height = CANVAS_HEIGHT;
    render.bounds.max.x = CANVAS_WIDTH;
    render.bounds.max.y = CANVAS_HEIGHT;
    
    // Пересоздаем границы мира
    createWorldBounds();
    
    // Масштабируем позиции всех объектов
    const scaleX = CANVAS_WIDTH / oldWidth;
    const scaleY = CANVAS_HEIGHT / oldHeight;
    
    // Масштабируем игроков
    for (let id in playerBodies) {
        const player = playerBodies[id];
        Body.setPosition(player, {
            x: player.position.x * scaleX,
            y: player.position.y * scaleY
        });
    }
    
    // Масштабируем сыр
    if (cheese) {
        Body.setPosition(cheese, {
            x: cheese.position.x * scaleX,
            y: cheese.position.y * scaleY
        });
    }
    
    // Масштабируем норку
    if (hole) {
        Body.setPosition(hole, {
            x: hole.position.x * scaleX,
            y: hole.position.y * scaleY
        });
    }
    
    // Масштабируем платформы
    platforms.forEach(platform => {
        Body.setPosition(platform, {
            x: platform.position.x * scaleX,
            y: platform.position.y * scaleY
        });
    });
    
    // Очищаем буферы состояний после ресайза, чтобы не было рассинхрона
    for (let id in playerStates) {
        playerStates[id].buffer = [];
    }
    
    console.log('📐 Размер изменён:', CANVAS_WIDTH, 'x', CANVAS_HEIGHT);
}

// Обработчики коллизий
function onCollisionStart(event) {
    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        
        // Проверка касания земли/платформ для прыжка
        if (myPlayer && (pair.bodyA === myPlayer || pair.bodyB === myPlayer)) {
            const other = pair.bodyA === myPlayer ? pair.bodyB : pair.bodyA;
            
            // Если касаемся чего-то статичного
            if (other.isStatic) {
                // Проверяем что мы сверху объекта (касание снизу)
                if (myPlayer.position.y < other.position.y - 10) {
                    canJump = true;
                    jumpCount = 0; // Сбрасываем счётчик прыжков
                }
                
                // Проверка касания стены для wall-jump
                if (other.label === 'leftWall' || other.label === 'rightWall') {
                    touchingWall = true;
                    lastWallSide = other.label === 'leftWall' ? 'left' : 'right';
                    jumpCount = 0; // Сбрасываем прыжки при касании стены
                    console.log('🧗 Касание стены:', lastWallSide, '- прыжки восстановлены');
                }
                
                // Касание платформы тоже восстанавливает прыжки
                if (other.label === 'platform' && myPlayer.position.y < other.position.y - 5) {
                    jumpCount = 0;
                }
            }
        }
    }
}

function onCollisionEnd(event) {
    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        
        if (myPlayer && (pair.bodyA === myPlayer || pair.bodyB === myPlayer)) {
            const other = pair.bodyA === myPlayer ? pair.bodyB : pair.bodyA;
            
            // Перестали касаться стены
            if (other.label === 'leftWall' || other.label === 'rightWall') {
                touchingWall = false;
                lastWallSide = null;
            }
        }
    }
}

// Создание игрока
function createPlayer(playerData) {
    const player = Bodies.circle(playerData.x, playerData.y, PLAYER_SIZE, {
        friction: 0.5,
        restitution: 0.1,
        density: 0.001,
        frictionAir: 0.01,
        render: {
            fillStyle: playerData.isShaman ? '#FFD700' : '#808080'
        }
    });
    
    player.playerId = playerData.id;
    player.hasCheese = playerData.hasCheese || false;
    player.isShaman = playerData.isShaman || false;
    World.add(engine.world, player);
    
    // Инициализируем буфер состояний для этого игрока
    if (playerData.id !== myPlayerId) {
        playerStates[playerData.id] = {
            buffer: [],
            targetX: playerData.x,
            targetY: playerData.y,
            targetVx: 0,
            targetVy: 0
        };
    }
    
    return player;
}

// Добавление состояния в буфер игрока
function addPlayerState(playerId, x, y, vx, vy) {
    if (!playerStates[playerId]) {
        playerStates[playerId] = {
            buffer: [],
            targetX: x,
            targetY: y,
            targetVx: vx,
            targetVy: vy
        };
    }
    
    const state = {
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        timestamp: Date.now()
    };
    
    playerStates[playerId].buffer.push(state);
    
    // Ограничиваем размер буфера
    if (playerStates[playerId].buffer.length > BUFFER_SIZE) {
        playerStates[playerId].buffer.shift();
    }
}

// Получение интерполированной позиции
function getInterpolatedPosition(playerId) {
    const state = playerStates[playerId];
    if (!state || state.buffer.length === 0) {
        return null;
    }
    
    const now = Date.now();
    const renderTime = now - INTERPOLATION_DELAY;
    
    // Находим два состояния для интерполяции
    let before = null;
    let after = null;
    
    for (let i = 0; i < state.buffer.length - 1; i++) {
        if (state.buffer[i].timestamp <= renderTime && state.buffer[i + 1].timestamp >= renderTime) {
            before = state.buffer[i];
            after = state.buffer[i + 1];
            break;
        }
    }
    
    // Если нет подходящих состояний, используем последнее
    if (!before || !after) {
        const latest = state.buffer[state.buffer.length - 1];
        return {
            x: latest.x,
            y: latest.y,
            vx: latest.vx,
            vy: latest.vy
        };
    }
    
    // Вычисляем коэффициент интерполяции
    const total = after.timestamp - before.timestamp;
    const elapsed = renderTime - before.timestamp;
    const t = total > 0 ? elapsed / total : 0;
    
    // Линейная интерполяция
    return {
        x: lerp(before.x, after.x, t),
        y: lerp(before.y, after.y, t),
        vx: lerp(before.vx, after.vx, t),
        vy: lerp(before.vy, after.vy, t)
    };
}

// Линейная интерполяция
function lerp(start, end, t) {
    return start + (end - start) * t;
}

// Обновление позиций других игроков с интерполяцией
function updateOtherPlayers() {
    for (let id in playerBodies) {
        if (id === myPlayerId) continue; // Пропускаем своего игрока
        
        const body = playerBodies[id];
        const state = playerStates[id];
        
        if (!body || !state) continue;
        
        // Получаем интерполированную позицию
        const interpolated = getInterpolatedPosition(id);
        
        if (interpolated) {
            // Плавно двигаем к целевой позиции
            const currentX = body.position.x;
            const currentY = body.position.y;
            
            const newX = lerp(currentX, interpolated.x, LERP_FACTOR);
            const newY = lerp(currentY, interpolated.y, LERP_FACTOR);
            
            Body.setPosition(body, { x: newX, y: newY });
            Body.setVelocity(body, { x: interpolated.vx, y: interpolated.vy });
        }
    }
}

// Создание сыра
function createCheese(x, y) {
    if (cheese) {
        World.remove(engine.world, cheese);
    }
    
    cheese = Bodies.circle(x, y, 15, {
        isStatic: true,
        isSensor: true,
        render: {
            fillStyle: '#FFD700',
            strokeStyle: '#FFA500',
            lineWidth: 3
        }
    });
    
    cheese.label = 'cheese';
    World.add(engine.world, cheese);
}

// Создание норки
function createHole(x, y) {
    if (hole) {
        World.remove(engine.world, hole);
    }
    
    hole = Bodies.circle(x, y, 30, {
        isStatic: true,
        isSensor: true,
        render: {
            fillStyle: '#4a2511',
            strokeStyle: '#2d1506',
            lineWidth: 3
        }
    });
    
    hole.label = 'hole';
    World.add(engine.world, hole);
}

// Создание платформы
function createPlatform(platformData) {
    const platform = Bodies.rectangle(
        platformData.x,
        platformData.y,
        platformData.width,
        platformData.height,
        {
            isStatic: true,
            angle: platformData.angle || 0,
            render: { fillStyle: '#8B4513' },
            label: 'platform'
        }
    );
    
    platform.platformId = platformData.id;
    World.add(engine.world, platform);
    platforms.push(platform);
}

// Обновление игрока
function updatePlayer() {
    if (!myPlayer) return;
    
    let velocityX = myPlayer.velocity.x;
    let velocityY = myPlayer.velocity.y;
    
    // Горизонтальное движение
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        velocityX = -MOVE_SPEED;
    } else if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        velocityX = MOVE_SPEED;
    } else {
        // Плавное замедление
        velocityX *= 0.9;
    }
    
    // Применяем новую скорость
    Body.setVelocity(myPlayer, { x: velocityX, y: velocityY });
    
    // Отправка позиции на сервер чаще для лучшей синхронизации
    if (Math.random() < 0.6 && ws.readyState === WebSocket.OPEN) { // Увеличили с 0.3 до 0.6
        // Конвертируем координаты к базовому размеру 800x500 для сервера
        const baseX = (myPlayer.position.x / CANVAS_WIDTH) * 800;
        const baseY = (myPlayer.position.y / CANVAS_HEIGHT) * 500;
        
        ws.send(JSON.stringify({
            type: 'move',
            x: baseX,
            y: baseY,
            vx: myPlayer.velocity.x,
            vy: myPlayer.velocity.y,
            timestamp: Date.now() // Добавляем временную метку
        }));
    }
}

// Проверка коллизий
function checkCollisions() {
    if (!myPlayer) return;
    
    // Проверка столкновения с сыром
    if (!myPlayer.hasCheese && cheese) {
        const distToCheese = Math.hypot(
            myPlayer.position.x - cheese.position.x,
            myPlayer.position.y - cheese.position.y
        );
        
        if (distToCheese < PLAYER_SIZE + 15) {
            myPlayer.hasCheese = true;
            myPlayer.render.fillStyle = myPlayer.isShaman ? '#FFD700' : '#FFA500';
            cheeseReached = false; // Сбрасываем флаг для норки
            
            ws.send(JSON.stringify({ type: 'collectCheese' }));
            console.log('🧀 Сыр собран!');
        }
    }
    
    // Проверка достижения норки (только с сыром)
    if (myPlayer.hasCheese && hole && !cheeseReached) {
        const distToHole = Math.hypot(
            myPlayer.position.x - hole.position.x,
            myPlayer.position.y - hole.position.y
        );
        
        console.log('Расстояние до норки:', distToHole);
        
        if (distToHole < PLAYER_SIZE + 30) {
            cheeseReached = true; // Устанавливаем флаг чтобы не отправлять повторно
            console.log('🏁 Достигнута норка! Отправляем победу...');
            
            ws.send(JSON.stringify({ type: 'reachHole' }));
        }
    }
}

// Обработчики событий
function setupEventHandlers() {
    // Клавиатура
    window.addEventListener('keydown', (e) => {
        if (keys[e.key]) return; // Предотвращаем повторные нажатия
        
        keys[e.key] = true;
        
        // Прыжок
        if ((e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && myPlayer) {
            performJump();
        }
        
        e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });
    
    // Мышь (для шамана) - только на desktop
    if (!isMobile) {
        canvas.addEventListener('click', (e) => {
            if (!isShaman) return;
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Конвертируем координаты к базовому размеру 800x500 для сервера
            const baseX = (x / CANVAS_WIDTH) * 800;
            const baseY = (y / CANVAS_HEIGHT) * 500;
            
            ws.send(JSON.stringify({
                type: 'buildPlatform',
                x: baseX,
                y: baseY,
                width: 100,
                height: 20,
                angle: 0
            }));
            
            console.log('🔨 Построена платформа на', baseX, baseY);
        });
    }
}

// Обработка WebSocket сообщений
ws.onopen = () => {
    console.log('✅ Подключено к серверу!');
    startPingMeasurement(); // Начинаем измерять пинг
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch(data.type) {
        case 'init':
            myPlayerId = data.playerId;
            isShaman = data.gameState.shamanId === myPlayerId;
            
            // Обновляем UI
            document.getElementById('player-id').textContent = myPlayerId.substr(0, 5);
            document.getElementById('player-role').textContent = isShaman ? '⭐ ШАМАН' : 'Мышь';
            
            // Создаем всех игроков
            for (let id in data.gameState.players) {
                const playerData = data.gameState.players[id];
                // Масштабируем позиции от базового размера 800x500 к текущему
                const scaledData = {
                    ...playerData,
                    x: (playerData.x / 800) * CANVAS_WIDTH,
                    y: (playerData.y / 500) * CANVAS_HEIGHT
                };
                const player = createPlayer(scaledData);
                playerBodies[id] = player;
                players[id] = playerData;
                
                if (id === myPlayerId) {
                    myPlayer = player;
                }
            }
            
            // Создаем сыр и норку
            if (data.gameState.cheese) {
                const scaledX = (data.gameState.cheese.x / 800) * CANVAS_WIDTH;
                const scaledY = (data.gameState.cheese.y / 500) * CANVAS_HEIGHT;
                createCheese(scaledX, scaledY);
            }
            if (data.gameState.hole) {
                const scaledX = (data.gameState.hole.x / 800) * CANVAS_WIDTH;
                const scaledY = (data.gameState.hole.y / 500) * CANVAS_HEIGHT;
                createHole(scaledX, scaledY);
            }
            
            // Создаем платформы
            data.gameState.platforms.forEach(p => {
                const scaledPlatform = {
                    ...p,
                    x: (p.x / 800) * CANVAS_WIDTH,
                    y: (p.y / 500) * CANVAS_HEIGHT,
                    width: (p.width / 800) * CANVAS_WIDTH,
                    height: (p.height / 500) * CANVAS_HEIGHT
                };
                createPlatform(scaledPlatform);
            });
            
            updatePlayerCount();
            console.log('🎮 Игра инициализирована! Всего игроков:', Object.keys(players).length);
            break;
            
        case 'playerJoined':
            console.log('👋 Новый игрок присоединился:', data.player.id);
            const scaledNewPlayer = {
                ...data.player,
                x: (data.player.x / 800) * CANVAS_WIDTH,
                y: (data.player.y / 500) * CANVAS_HEIGHT
            };
            const newPlayer = createPlayer(scaledNewPlayer);
            playerBodies[data.player.id] = newPlayer;
            players[data.player.id] = data.player;
            updatePlayerCount();
            break;
            
        case 'playerLeft':
            console.log('👋 Игрок покинул игру:', data.playerId);
            if (playerBodies[data.playerId]) {
                World.remove(engine.world, playerBodies[data.playerId]);
                delete playerBodies[data.playerId];
                delete players[data.playerId];
                delete playerStates[data.playerId]; // Очищаем буфер состояний
            }
            updatePlayerCount();
            break;
            
        case 'playerMove':
            if (playerBodies[data.playerId] && data.playerId !== myPlayerId) {
                const scaledX = (data.x / 800) * CANVAS_WIDTH;
                const scaledY = (data.y / 500) * CANVAS_HEIGHT;
                
                // Добавляем позицию в буфер для интерполяции
                addPlayerState(data.playerId, scaledX, scaledY, data.vx, data.vy);
            }
            break;
            
        case 'cheeseCollected':
            console.log('🧀 Игрок', data.playerId.substr(0, 5), 'собрал сыр!');
            if (cheese) {
                World.remove(engine.world, cheese);
                cheese = null;
            }
            if (playerBodies[data.playerId]) {
                playerBodies[data.playerId].hasCheese = true;
                const isPlayerShaman = players[data.playerId]?.isShaman;
                playerBodies[data.playerId].render.fillStyle = isPlayerShaman ? '#FFD700' : '#FFA500';
            }
            break;
            
        case 'playerWon':
            console.log('🏆 Победитель:', data.playerId);
            showMessage(`🎉 Игрок ${data.playerId.substr(0, 5)} победил!`);
            break;
            
        case 'roundReset':
            console.log('🔄 Сброс раунда');
            showMessage('🔄 Новый раунд!');
            
            // Сбрасываем флаги
            cheeseReached = false;
            jumpCount = 0;
            canJump = false;
            touchingWall = false;
            lastWallSide = null;
            
            // Очищаем буферы состояний всех игроков
            for (let id in playerStates) {
                playerStates[id].buffer = [];
            }
            
            // Сбрасываем сыр и норку
            if (data.gameState.cheese) {
                const scaledX = (data.gameState.cheese.x / 800) * CANVAS_WIDTH;
                const scaledY = (data.gameState.cheese.y / 500) * CANVAS_HEIGHT;
                createCheese(scaledX, scaledY);
            }
            if (data.gameState.hole) {
                const scaledX = (data.gameState.hole.x / 800) * CANVAS_WIDTH;
                const scaledY = (data.gameState.hole.y / 500) * CANVAS_HEIGHT;
                createHole(scaledX, scaledY);
            }
            
            // Удаляем платформы
            platforms.forEach(p => World.remove(engine.world, p));
            platforms = [];
            
            // Сбрасываем игроков
            for (let id in playerBodies) {
                const scaledX = (100 / 800) * CANVAS_WIDTH;
                const scaledY = (400 / 500) * CANVAS_HEIGHT;
                Body.setPosition(playerBodies[id], { x: scaledX, y: scaledY });
                Body.setVelocity(playerBodies[id], { x: 0, y: 0 });
                playerBodies[id].hasCheese = false;
                const isPlayerShaman = players[id]?.isShaman;
                playerBodies[id].render.fillStyle = isPlayerShaman ? '#FFD700' : '#808080';
            }
            break;
            
        case 'platformBuilt':
            const scaledPlatform = {
                ...data.platform,
                x: (data.platform.x / 800) * CANVAS_WIDTH,
                y: (data.platform.y / 500) * CANVAS_HEIGHT,
                width: (data.platform.width / 800) * CANVAS_WIDTH,
                height: (data.platform.height / 500) * CANVAS_HEIGHT
            };
            createPlatform(scaledPlatform);
            console.log('🔨 Платформа построена');
            break;
            
        case 'newShaman':
            console.log('⭐ Новый шаман назначен:', data.shamanId);
            
            // Обновляем информацию о шамане
            if (data.shamanId === myPlayerId) {
                isShaman = true;
                document.getElementById('player-role').textContent = '⭐ ШАМАН';
                if (myPlayer) {
                    myPlayer.render.fillStyle = '#FFD700';
                    myPlayer.isShaman = true;
                }
            }
            
            // Обновляем цвет нового шамана
            if (playerBodies[data.shamanId]) {
                playerBodies[data.shamanId].render.fillStyle = '#FFD700';
                playerBodies[data.shamanId].isShaman = true;
            }
            
            // Обновляем данные игроков
            if (players[data.shamanId]) {
                players[data.shamanId].isShaman = true;
            }
            break;
            
        case 'pong':
            // Получили ответ от сервера - вычисляем пинг
            currentPing = Date.now() - pingStartTime;
            updatePingDisplay();
            break;
    }
};

ws.onclose = () => {
    console.log('❌ Отключено от сервера');
    showMessage('❌ Соединение потеряно!');
    
    // Останавливаем измерение пинга
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
};

ws.onerror = (error) => {
    console.error('⚠️ WebSocket ошибка:', error);
};

// Вспомогательные функции
function showMessage(text) {
    const msg = document.getElementById('game-message');
    msg.textContent = text;
    msg.classList.add('show');
    
    setTimeout(() => {
        msg.classList.remove('show');
    }, 3000);
}

function updatePlayerCount() {
    document.getElementById('player-count').textContent = Object.keys(players).length;
}

// Запуск игры при загрузке страницы
window.addEventListener('load', init);

// Определение мобильного устройства
function detectMobileDevice() {
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const touchCheck = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    isMobile = mobileCheck || touchCheck;
    
    if (isMobile) {
        console.log('📱 Мобильное устройство обнаружено - включаем сенсорное управление');
        const mobileControlsDiv = document.getElementById('mobile-controls');
        if (mobileControlsDiv) {
            mobileControlsDiv.classList.add('active');
        }
        
        // Обновляем инструкции для мобильных
        const instructions = document.getElementById('instructions');
        if (instructions) {
            instructions.innerHTML = `
                <p><strong>📱 Мобильное управление!</strong></p>
                <p><strong>⚡ Lag-compensation</strong></p>
                <p>◄ ► - движение</p>
                <p>⬆ - прыжок (двойной!)</p>
                <p>🧗 Wall-jump работает!</p>
                <p><strong>Шаман:</strong> тап - платформа</p>
            `;
        }
        
        setupMobileControls();
    } else {
        console.log('🖥️ Desktop устройство - клавиатурное управление');
    }
}

// Настройка мобильного управления
function setupMobileControls() {
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnJump = document.getElementById('btn-jump');
    
    // Кнопка влево
    if (btnLeft) {
        btnLeft.addEventListener('touchstart', (e) => {
            e.preventDefault();
            mobileControls.left = true;
            keys['ArrowLeft'] = true;
            btnLeft.classList.add('pressed');
        });
        
        btnLeft.addEventListener('touchend', (e) => {
            e.preventDefault();
            mobileControls.left = false;
            keys['ArrowLeft'] = false;
            btnLeft.classList.remove('pressed');
        });
        
        btnLeft.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            mobileControls.left = false;
            keys['ArrowLeft'] = false;
            btnLeft.classList.remove('pressed');
        });
    }
    
    // Кнопка вправо
    if (btnRight) {
        btnRight.addEventListener('touchstart', (e) => {
            e.preventDefault();
            mobileControls.right = true;
            keys['ArrowRight'] = true;
            btnRight.classList.add('pressed');
        });
        
        btnRight.addEventListener('touchend', (e) => {
            e.preventDefault();
            mobileControls.right = false;
            keys['ArrowRight'] = false;
            btnRight.classList.remove('pressed');
        });
        
        btnRight.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            mobileControls.right = false;
            keys['ArrowRight'] = false;
            btnRight.classList.remove('pressed');
        });
    }
    
    // Кнопка прыжка
    if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            
            if (!mobileControls.jump && myPlayer) {
                mobileControls.jump = true;
                btnJump.classList.add('pressed');
                
                // Выполняем прыжок
                performJump();
                
                // Небольшая задержка перед следующим прыжком
                setTimeout(() => {
                    mobileControls.jump = false;
                }, 150);
            }
        });
        
        btnJump.addEventListener('touchend', (e) => {
            e.preventDefault();
            btnJump.classList.remove('pressed');
        });
        
        btnJump.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            btnJump.classList.remove('pressed');
        });
    }
    
    // Touch для шамана (строительство платформ)
    canvas.addEventListener('touchstart', handleTouchBuild);
}

// Обработка прыжка (вынесена в отдельную функцию)
function performJump() {
    if (!myPlayer) return;
    
    let jumped = false;
    
    // Обычный прыжок с земли
    if (canJump) {
        Body.setVelocity(myPlayer, { 
            x: myPlayer.velocity.x, 
            y: JUMP_FORCE 
        });
        canJump = false;
        jumpCount = 1;
        jumped = true;
        console.log('⬆️ Прыжок с земли! (1/' + MAX_JUMPS + ')');
    }
    // Двойной прыжок в воздухе
    else if (jumpCount < MAX_JUMPS && !touchingWall) {
        Body.setVelocity(myPlayer, { 
            x: myPlayer.velocity.x, 
            y: DOUBLE_JUMP_FORCE 
        });
        jumpCount++;
        jumped = true;
        console.log('⬆️⬆️ Двойной прыжок в воздухе! (' + jumpCount + '/' + MAX_JUMPS + ')');
    }
    // Wall-jump от стены
    else if (touchingWall && lastWallSide) {
        const pushDirection = lastWallSide === 'left' ? WALL_JUMP_PUSH : -WALL_JUMP_PUSH;
        
        Body.setVelocity(myPlayer, { 
            x: pushDirection, 
            y: WALL_JUMP_FORCE 
        });
        
        jumpCount = 1;
        touchingWall = false;
        lastWallSide = null;
        jumped = true;
        console.log('🧗 Wall-jump! Осталось прыжков:', MAX_JUMPS - jumpCount);
    }
    
    // Вибрация на мобильных при успешном прыжке
    if (jumped && isMobile && navigator.vibrate) {
        navigator.vibrate(50); // Короткая вибрация 50мс
    }
}

// Обработка touch для строительства платформ
function handleTouchBuild(e) {
    if (!isShaman) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    // Проверяем что тап не по кнопкам управления
    const btnJump = document.getElementById('btn-jump');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    
    const jumpRect = btnJump ? btnJump.getBoundingClientRect() : null;
    const leftRect = btnLeft ? btnLeft.getBoundingClientRect() : null;
    const rightRect = btnRight ? btnRight.getBoundingClientRect() : null;
    
    const touchX = touch.clientX;
    const touchY = touch.clientY;
    
    // Проверяем что не попали в кнопки
    const hitButton = 
        (jumpRect && touchX >= jumpRect.left && touchX <= jumpRect.right && touchY >= jumpRect.top && touchY <= jumpRect.bottom) ||
        (leftRect && touchX >= leftRect.left && touchX <= leftRect.right && touchY >= leftRect.top && touchY <= leftRect.bottom) ||
        (rightRect && touchX >= rightRect.left && touchX <= rightRect.right && touchY >= rightRect.top && touchY <= rightRect.bottom);
    
    if (hitButton) return;
    
    // Конвертируем координаты к базовому размеру 800x500 для сервера
    const baseX = (x / CANVAS_WIDTH) * 800;
    const baseY = (y / CANVAS_HEIGHT) * 500;
    
    ws.send(JSON.stringify({
        type: 'buildPlatform',
        x: baseX,
        y: baseY,
        width: 100,
        height: 20,
        angle: 0
    }));
    
    console.log('🔨 Построена платформа на', baseX, baseY);
}

// Измерение пинга
function startPingMeasurement() {
    pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            pingStartTime = Date.now();
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 2000); // Каждые 2 секунды
}

function updatePingDisplay() {
    const pingElement = document.getElementById('ping-value');
    if (pingElement) {
        pingElement.textContent = currentPing;
        
        // Цветовая индикация пинга
        const pingInfo = document.getElementById('ping-info');
        if (currentPing < 50) {
            pingInfo.style.color = '#00ff00'; // Зелёный - отличный пинг
        } else if (currentPing < 100) {
            pingInfo.style.color = '#ffff00'; // Жёлтый - хороший пинг
        } else if (currentPing < 200) {
            pingInfo.style.color = '#ff9900'; // Оранжевый - средний пинг
        } else {
            pingInfo.style.color = '#ff0000'; // Красный - плохой пинг
        }
    }
}