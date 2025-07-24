/*
 * Survivor clone game logic
 *
 * This script implements a simplified auto‑battler inspired by Vampire Survivors.
 * A lone player is surrounded by waves of enemies and must survive as long as
 * possible. The player attacks automatically and gains experience when
 * defeating foes. Upon leveling up, the player can choose from a selection of
 * skills that modify their abilities.
 */

(() => {
    // Canvas and rendering context
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // UI elements
    const healthFill = document.getElementById('health-fill');
    const expFill = document.getElementById('exp-fill');
    const levelNumberEl = document.getElementById('level-number');
    const levelUpPanel = document.getElementById('level-up-panel');
    const choicesContainer = document.getElementById('choices');
    const gameOverPanel = document.getElementById('game-over-panel');
    const restartBtn = document.getElementById('restart-btn');

    // Game state variables
    let player;
    let enemies;
    let projectiles;
    let orbs; // experience orbs
    let orbitWeapons; // orbiting weapons that deal damage on contact
    let lastSpawnTime;
    let spawnInterval;
    let spawnAcceleration;
    let lastShotTime;
    let gamePaused = false;
    let gameOver = false;
    const images = {};

    // Input tracking
    const keys = {};
    window.addEventListener('keydown', e => { keys[e.code] = true; });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // Utility functions
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function randRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image ' + src));
            img.src = src;
        });
    }

    // Skill definitions
    const skills = {
        damageUp: {
            id: 'damageUp',
            name: 'Damage Up',
            description: 'Increase projectile damage by 1.',
            maxLevel: 5,
            level: 0,
            apply() { player.damage += 1; }
        },
        attackSpeedUp: {
            id: 'attackSpeedUp',
            name: 'Attack Speed Up',
            description: 'Shoot faster by reducing the delay between shots.',
            maxLevel: 5,
            level: 0,
            apply() { player.shootInterval = Math.max(0.1, player.shootInterval * 0.9); }
        },
        moveSpeedUp: {
            id: 'moveSpeedUp',
            name: 'Movement Speed Up',
            description: 'Increase your movement speed by 10%.',
            maxLevel: 5,
            level: 0,
            apply() { player.speed *= 1.1; }
        },
        pierceBullet: {
            id: 'pierceBullet',
            name: 'Piercing Bullets',
            description: 'Your bullets pierce through one additional enemy.',
            maxLevel: 3,
            level: 0,
            apply() { player.pierce += 1; }
        },
        multiShot: {
            id: 'multiShot',
            name: 'Multi Shot',
            description: 'Shoot an additional bullet each attack (spread).',
            maxLevel: 3,
            level: 0,
            apply() { player.bulletCount += 1; }
        },
        orbitingOrb: {
            id: 'orbitingOrb',
            name: 'Orbiting Orb',
            description: 'Summon an orb that revolves around you and damages enemies on contact.',
            maxLevel: 3,
            level: 0,
            apply() {
                const count = orbitWeapons.length;
                const angle = (count / (count + 1)) * Math.PI * 2;
                orbitWeapons.push({ angle: angle, radius: 40 + 10 * count, speed: 2 + 0.5 * count, damage: 1 + count });
            }
        }
    };

    /**
     * Reset the game state to start a new run.
     */
    function initGame() {
        // Player base properties
        player = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: 22,
            speed: 180,
            maxHealth: 100,
            health: 100,
            xp: 0,
            level: 1,
            xpNeeded: 20,
            damage: 2,
            shootInterval: 0.6,
            bulletSpeed: 400,
            bulletCount: 1,
            pierce: 0,
            lastMoveDir: { x: 1, y: 0 }
        };
        enemies = [];
        projectiles = [];
        orbs = [];
        orbitWeapons = [];
        lastSpawnTime = 0;
        spawnInterval = 2.0;
        spawnAcceleration = 0.998;
        lastShotTime = 0;
        gamePaused = false;
        gameOver = false;
        // Reset skills
        Object.values(skills).forEach(s => { s.level = 0; });
        updateUI();
        levelUpPanel.classList.add('hidden');
        gameOverPanel.classList.add('hidden');
        // Remove debug messages
        const dbg = document.getElementById('debug');
        if (dbg) dbg.textContent = '';
    }

    /** Update the UI bars and level display. */
    function updateUI() {
        const healthPercent = player.health / player.maxHealth;
        healthFill.style.transform = `scaleX(${clamp(healthPercent, 0, 1)})`;
        const expPercent = player.xp / player.xpNeeded;
        expFill.style.transform = `scaleX(${clamp(expPercent, 0, 1)})`;
        levelNumberEl.textContent = player.level;
    }

    /** Show the level up panel with up to three skills to choose from. */
    function showLevelUp() {
        gamePaused = true;
        choicesContainer.innerHTML = '';
        const available = Object.values(skills).filter(s => s.level < s.maxLevel);
        const shuffled = available.sort(() => Math.random() - 0.5);
        const offered = shuffled.slice(0, Math.min(3, shuffled.length));
        offered.forEach(skill => {
            const btn = document.createElement('button');
            btn.className = 'btn choice-btn';
            btn.innerHTML = `<strong>${skill.name}</strong><br><small>${skill.description}</small>`;
            btn.addEventListener('click', () => {
                skill.apply();
                skill.level += 1;
                player.xp = 0;
                player.level += 1;
                player.xpNeeded = Math.floor(player.xpNeeded * 1.35 + 10);
                updateUI();
                levelUpPanel.classList.add('hidden');
                gamePaused = false;
            });
            choicesContainer.appendChild(btn);
        });
        levelUpPanel.classList.remove('hidden');
    }

    /** Spawn an enemy at a random edge location. */
    function spawnEnemy() {
        const side = Math.floor(randRange(0, 4));
        let x, y;
        if (side === 0) { x = randRange(0, canvas.width); y = -30; }
        else if (side === 1) { x = canvas.width + 30; y = randRange(0, canvas.height); }
        else if (side === 2) { x = randRange(0, canvas.width); y = canvas.height + 30; }
        else { x = -30; y = randRange(0, canvas.height); }
        enemies.push({ x: x, y: y, radius: 20, speed: randRange(60, 100), health: 6, maxHealth: 6, damage: 10 });
    }

    /** Fire bullets towards the nearest enemy or last move direction. */
    function shootBullets(time) {
        if (time - lastShotTime < player.shootInterval) return;
        lastShotTime = time;
        let dirX = player.lastMoveDir.x;
        let dirY = player.lastMoveDir.y;
        let nearest = null;
        let minDist = Infinity;
        for (const e of enemies) {
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) { minDist = dist; nearest = e; }
        }
        if (nearest) {
            const dx = nearest.x - player.x;
            const dy = nearest.y - player.y;
            const mag = Math.hypot(dx, dy);
            if (mag > 0) { dirX = dx / mag; dirY = dy / mag; }
        }
        const bullets = [];
        const count = player.bulletCount;
        for (let i = 0; i < count; i++) {
            let angleOffset = 0;
            if (count > 1) {
                const spread = Math.PI / 12;
                angleOffset = spread * (i - (count - 1) / 2);
            }
            const baseAngle = Math.atan2(dirY, dirX);
            const angle = baseAngle + angleOffset;
            bullets.push({ x: player.x, y: player.y, dx: Math.cos(angle), dy: Math.sin(angle), speed: player.bulletSpeed, damage: player.damage, pierce: player.pierce });
        }
        projectiles.push(...bullets);
    }

    /** Handle player movement based on keyboard input. */
    function movePlayer(delta) {
        let dx = 0, dy = 0;
        if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
        if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
        if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
        if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
        if (dx !== 0 || dy !== 0) {
            const mag = Math.hypot(dx, dy);
            dx /= mag; dy /= mag;
            player.x += dx * player.speed * delta;
            player.y += dy * player.speed * delta;
            player.lastMoveDir = { x: dx, y: dy };
        }
        player.x = clamp(player.x, player.radius, canvas.width - player.radius);
        player.y = clamp(player.y, player.radius, canvas.height - player.radius);
    }

    /** Update orbiting weapons positions and apply continuous damage. */
    function updateOrbitWeapons(delta) {
        for (const orb of orbitWeapons) {
            orb.angle += orb.speed * delta;
            const ox = player.x + Math.cos(orb.angle) * orb.radius;
            const oy = player.y + Math.sin(orb.angle) * orb.radius;
            for (const enemy of enemies) {
                const dx = enemy.x - ox;
                const dy = enemy.y - oy;
                const dist = Math.hypot(dx, dy);
                if (dist < enemy.radius + 6) {
                    enemy.health -= orb.damage * delta * 4;
                }
            }
        }
    }

    /** Update game entities based on elapsed time. */
    function update(delta, time) {
        // Spawn enemies
        if (time - lastSpawnTime > spawnInterval) {
            spawnEnemy();
            lastSpawnTime = time;
            spawnInterval = Math.max(0.5, spawnInterval * spawnAcceleration);
        }
        movePlayer(delta);
        shootBullets(time);
        // Projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.x += p.dx * p.speed * delta;
            p.y += p.dy * p.speed * delta;
            if (p.x < -50 || p.x > canvas.width + 50 || p.y < -50 || p.y > canvas.height + 50) {
                projectiles.splice(i, 1);
                continue;
            }
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                const dx = e.x - p.x;
                const dy = e.y - p.y;
                if (Math.hypot(dx, dy) < e.radius + 4) {
                    e.health -= p.damage;
                    if (p.pierce > 0) { p.pierce -= 1; } else { projectiles.splice(i, 1); i--; }
                    break;
                }
            }
        }
        // Enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                e.x += (dx / dist) * e.speed * delta;
                e.y += (dy / dist) * e.speed * delta;
            }
            if (dist < e.radius + player.radius) {
                player.health -= e.damage * delta;
                if (player.health <= 0) {
                    player.health = 0;
                    triggerGameOver();
                    return;
                }
            }
            if (e.health <= 0) {
                orbs.push({ x: e.x, y: e.y, value: 5 });
                enemies.splice(i, 1);
            }
        }
        updateOrbitWeapons(delta);
        // XP orbs
        for (let i = orbs.length - 1; i >= 0; i--) {
            const orb = orbs[i];
            const dx = player.x - orb.x;
            const dy = player.y - orb.y;
            const dist = Math.hypot(dx, dy);
            if (dist < player.radius + 8) {
                player.xp += orb.value;
                orbs.splice(i, 1);
                if (player.xp >= player.xpNeeded) {
                    showLevelUp();
                }
                updateUI();
                continue;
            }
            const speed = 120;
            if (dist > 0) {
                orb.x += (dx / dist) * speed * delta;
                orb.y += (dy / dist) * speed * delta;
            }
        }
        updateUI();
    }

    /** Draw the game scene onto the canvas. */
    function draw() {
        // Background tiling
        const bg = images.background;
        const tileSize = bg.width;
        for (let y = 0; y < canvas.height; y += tileSize) {
            for (let x = 0; x < canvas.width; x += tileSize) {
                ctx.drawImage(bg, x, y, tileSize, tileSize);
            }
        }
        // XP orbs
        ctx.fillStyle = '#f1c40f';
        for (const orb of orbs) {
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, 6, 0, Math.PI * 2);
            ctx.fill();
        }
        // Bullets
        ctx.fillStyle = '#ecf0f1';
        for (const p of projectiles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        // Enemies
        const enemyImg = images.enemy;
        for (const e of enemies) {
            const size = e.radius * 2;
            ctx.drawImage(enemyImg, e.x - e.radius, e.y - e.radius, size, size);
        }
        // Player
        const playerImg = images.player;
        const pSize = player.radius * 2;
        ctx.drawImage(playerImg, player.x - player.radius, player.y - player.radius, pSize, pSize);
        // Orbit weapons
        ctx.fillStyle = '#9b59b6';
        for (const orb of orbitWeapons) {
            const ox = player.x + Math.cos(orb.angle) * orb.radius;
            const oy = player.y + Math.sin(orb.angle) * orb.radius;
            ctx.beginPath();
            ctx.arc(ox, oy, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** Trigger game over sequence. */
    function triggerGameOver() {
        gameOver = true;
        gamePaused = true;
        gameOverPanel.classList.remove('hidden');
    }

    // Game loop
    let lastTime = performance.now();
    function gameLoop(now) {
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        if (!gamePaused) update(delta, now / 1000);
        draw();
        requestAnimationFrame(gameLoop);
    }

    /** Preload images and show debug messages while loading. */
    async function preload() {
        // create debug element
        const createDbg = () => {
            let dbg = document.getElementById('debug');
            if (!dbg) {
                dbg = document.createElement('div');
                dbg.id = 'debug';
                dbg.style.position = 'absolute';
                dbg.style.bottom = '10px';
                dbg.style.left = '10px';
                dbg.style.color = 'white';
                dbg.style.fontSize = '12px';
                document.body.appendChild(dbg);
            }
            return dbg;
        };
        const dbg = createDbg();
        dbg.textContent = 'Loading images...';
        try {
            const playerImg = await loadImage('assets/player.png');
            const enemyImg = await loadImage('assets/enemy.png');
            const bgImg = await loadImage('assets/background.png');
            images.player = playerImg;
            images.enemy = enemyImg;
            images.background = bgImg;
            dbg.textContent = 'Images loaded';
        } catch (err) {
            dbg.textContent = 'Error loading images';
            throw err;
        }
    }

    // Restart button event
    restartBtn.addEventListener('click', () => { initGame(); });

    // Start the game
    preload().then(() => {
        initGame();
        requestAnimationFrame(gameLoop);
    }).catch(err => {
        console.error(err);
    });
})();