import mineflayer from 'mineflayer';
import fs from 'fs/promises'; // Use promise-based fs for ESM
import path from 'path';

// --- SETUP & CONFIG ---
const args = process.argv.slice(2);
const registerFlag = args.includes('-r') || args.includes('--register');

// Helper to read/write JSON in ESM
async function getSettings() {
    const data = await fs.readFile('./settings.json', 'utf8');
    return JSON.parse(data);
}

async function saveSettings(settings) {
    await fs.writeFile('./settings.json', JSON.stringify(settings, null, 2));
}

async function createBot() {
    let settings;
    try {
        settings = await getSettings();
    } catch (err) {
        console.error("Could not read settings.json. Make sure it exists!");
        process.exit(1);
    }

    if (registerFlag) {
        const newPass = Math.random().toString(36).slice(-8);
        settings.password = newPass;
        settings.auth = true;
        await saveSettings(settings);
        console.log(`[AUTH] Registering new account with password: ${newPass}`);
    }

    const bot = mineflayer.createBot({
        host: settings.host,
        port: settings.port,
        username: settings.username,
        version: settings.version
    });

    let lastPos = null;
    let isMoving = false;

    // --- UTILITIES ---

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

    async function sendLoreMessage() {
        try {
            const data = await fs.readFile('./messages.json', 'utf8');
            const messages = JSON.parse(data);
            const msg = messages[Math.floor(Math.random() * messages.length)];
            bot.chat(msg);
            
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
            console.log("[STATE] Entering Active Phase");
            const activeEndTime = Date.now() + 5 * 60 * 1000;
            
            while (Date.now() < activeEndTime) {
                if (Math.random() > 0.85) {
                    await desperationMining();
                } else {
                    await humanMovement();
                }
            }

            console.log("[STATE] Entering AFK Phase");
            bot.clearControlStates();
            isMoving = false;
            await smoothLook(bot.entity.yaw, -0.5);
            
            const afkTime = (5 + Math.random() * 5) * 60 * 1000;
            await new Promise(res => setTimeout(res, afkTime));
        }
    }

    async function humanMovement() {
        isMoving = true;
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
            const stopMining = Date.now() + 60000;
            while (Date.now() < stopMining) {
                try {
                    await bot.dig(block, true);
                } catch (e) {
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
            setTimeout(sendLoreMessage, 6000);
            startPrisonLife();
        }, 3000);
    });

    setInterval(() => {
        if (!isMoving || !bot.entity) return;
        const currentPos = bot.entity.position;
        if (lastPos && currentPos.distanceTo(lastPos) < 0.2) {
            bot.clearControlStates();
            bot.setControlState('back', true);
            setTimeout(async () => {
                bot.setControlState('back', false);
                const turn = bot.entity.yaw + Math.PI + (Math.random() - 0.5);
                await smoothLook(turn, 0);
            }, 800);
        }
        lastPos = currentPos.clone();
    }, 2000);

    bot.on('error', (err) => console.log("Error:", err));
    bot.on('end', () => {
        console.log("Disconnected. Reconnecting...");
        setTimeout(createBot, 10000);
    });
}

createBot();
