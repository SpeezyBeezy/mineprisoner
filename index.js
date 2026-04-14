const mineflayer = require('mineflayer');
const fs = require('fs');

// --- SETUP & CONFIG ---
const args = process.argv.slice(2);
const registerFlag = args.includes('-r') || args.includes('--register');
let settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

if (registerFlag) {
    // Generate 8-character alphanumeric password
    const newPass = Math.random().toString(36).slice(-8);
    settings.password = newPass;
    settings.auth = true;
    fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
    console.log(`[AUTH] Registering new account with password: ${newPass}`);
}

function createBot() {
    const bot = mineflayer.createBot({
        host: settings.host,
        port: settings.port,
        username: settings.username,
        version: settings.version
    });

    let lastPos = null;
    let isMoving = false;

    // --- UTILITIES ---

    // Human-like smooth looking
    async function smoothLook(yaw, pitch) {
        const steps = 15;
        const startYaw = bot.entity.yaw;
        const startPitch = bot.entity.pitch;

        for (let i = 1; i <= steps; i++) {
            await bot.waitForTicks(1);
            const currentYaw = startYaw + (yaw - startYaw) * (i / steps);
            const currentPitch = startPitch + (pitch - startPitch) * (i / steps);
            bot.look(currentYaw, currentPitch, true);
        }
    }

    function sendLoreMessage() {
        try {
            const messages = JSON.parse(fs.readFileSync('messages.json', 'utf8'));
            const msg = messages[Math.floor(Math.random() * messages.length)];
            bot.chat(msg);
            
            // Jittered 15-minute timer (15 mins +/- 2 mins)
            const jitter = (Math.random() * 240000) - 120000;
            const nextInterval = (15 * 60 * 1000) + jitter;
            setTimeout(sendLoreMessage, nextInterval);
        } catch (e) {
            console.log("Error reading messages.json");
        }
    }

    // --- BRAIN LOGIC ---

    async function startPrisonLife() {
        while (true) {
            // PHASE A: ACTIVE (approx 5 mins)
            console.log("[STATE] Entering Active Phase (Pacing/Mining)");
            const activeEndTime = Date.now() + 5 * 60 * 1000;
            
            while (Date.now() < activeEndTime) {
                if (Math.random() > 0.85) {
                    await desperationMining();
                } else {
                    await humanMovement();
                }
            }

            // PHASE B: AFK (approx 5-10 mins)
            console.log("[STATE] Entering AFK Phase");
            bot.clearControlStates();
            isMoving = false;
            // Look down slightly like someone tabbed out
            await smoothLook(bot.entity.yaw, -0.5);
            
            const afkTime = (5 + Math.random() * 5) * 60 * 1000;
            await new Promise(res => setTimeout(res, afkTime));
        }
    }

    async function humanMovement() {
        isMoving = true;
        // 95% W, but mix in ASD
        const keys = ['forward', 'back', 'left', 'right'];
        const weights = [0.90, 0.02, 0.04, 0.04];
        
        const randomKey = () => {
            let r = Math.random(), sum = 0;
            for (let i = 0; i < keys.length; i++) {
                sum += weights[i];
                if (r <= sum) return keys[i];
            }
        };

        const key = randomKey();
        bot.setControlState(key, true);
        bot.setControlState('jump', Math.random() > 0.8);
        bot.setControlState('sprint', Math.random() > 0.5);
        bot.setControlState('sneak', Math.random() > 0.9);

        // Look around while moving
        const targetYaw = bot.entity.yaw + (Math.random() - 0.5) * 2;
        const targetPitch = (Math.random() - 0.5) * 0.5;
        await smoothLook(targetYaw, targetPitch);

        await bot.waitForTicks(40);
        bot.clearControlStates();
    }

    async function desperationMining() {
        isMoving = false;
        const block = bot.findBlock({ matching: (b) => b.name === 'bedrock', maxDistance: 4 });
        if (block) {
            await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
            console.log("[ACTION] Desperation mining bedrock...");
            
            // Start digging for ~1 minute
            const stopMining = Date.now() + 60000;
            while (Date.now() < stopMining) {
                try {
                    await bot.dig(block, true);
                } catch (e) {
                    // Bedrock can't be broken, error is expected
                    await bot.waitForTicks(10);
                }
            }
        }
    }

    // --- EVENT HANDLERS ---

    bot.on('spawn', () => {
        console.log("[EVENT] Bot Spawned");
        setTimeout(() => {
            if (settings.auth) {
                if (registerFlag) {
                    bot.chat(`/register ${settings.password} ${settings.password}`);
                } else {
                    bot.chat(`/login ${settings.password}`);
                }
            }
            
            // Start the lore timer (Initial msg after 6s)
            setTimeout(sendLoreMessage, 6000);
            // Start the movement cycles
            startPrisonLife();
        }, 3000);
    });

    // Wall detection: if moving but not changing position
    setInterval(() => {
        if (!isMoving || !bot.entity) return;
        
        const currentPos = bot.entity.position;
        if (lastPos && currentPos.distanceTo(lastPos) < 0.2) {
            // Stuck! Back away and turn
            bot.clearControlStates();
            bot.setControlState('back', true);
            setTimeout(async () => {
                bot.setControlState('back', false);
                // Turn roughly 180 degrees (PI radians)
                const turn = bot.entity.yaw + Math.PI + (Math.random() - 0.5);
                await smoothLook(turn, 0);
            }, 800);
        }
        lastPos = currentPos.clone();
    }, 2000);

    bot.on('death', () => bot.chat("..."));
    bot.on('kicked', (reason) => console.log("Kicked:", reason));
    bot.on('error', (err) => console.log("Error:", err));
    bot.on('end', () => {
        console.log("Disconnected. Reconnecting in 10s...");
        setTimeout(createBot, 10000);
    });
}

createBot();