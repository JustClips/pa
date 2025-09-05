const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// --- In-Memory Stores ---
const brainrots = new Map();
const activePlayers = new Map();

// This map will store the timer ID for each brainrot's automatic deletion
const brainrotTimers = new Map();

// --- Configuration ---
const BRAINROT_TTL_MS = 30 * 1000; // Brainrots live for exactly 30 seconds
const PLAYER_INACTIVITY_MS = 30 * 1000; // Players are removed after 30 seconds of inactivity
const PLAYER_CLEANUP_INTERVAL_MS = 5000; // Check for inactive players every 5 seconds

function now() {
  return Date.now();
}

// --- Automatic Player Cleanup (Inactivity-based) ---
function cleanupInactivePlayers() {
  const currentTime = now();
  for (const [key, player] of activePlayers.entries()) {
    if (currentTime - player.lastSeen > PLAYER_INACTIVITY_MS) {
      activePlayers.delete(key);
    }
  }
}

setInterval(cleanupInactivePlayers, PLAYER_CLEANUP_INTERVAL_MS);


// --- API Endpoints ---

// Player heartbeat endpoint - resets inactivity timer
app.post('/players/heartbeat', (req, res) => {
  const { username, serverId, jobId, placeId } = req.body;
  if (!username || !serverId || !jobId) {
    return res.status(400).json({ error: "Missing username, serverId, or jobId" });
  }
  const key = `${username.toLowerCase()}_${serverId}_${jobId}`;
  activePlayers.set(key, {
    username: username,
    serverId: serverId,
    jobId: jobId,
    placeId: placeId || serverId,
    lastSeen: now()
  });
  res.json({ success: true });
});

// Active players endpoint
app.get('/players/active', (req, res) => {
  const allPlayers = Array.from(activePlayers.values()).map(player => ({
    username: player.username,
    serverId: player.serverId,
    jobId: player.jobId,
    placeId: player.placeId,
    secondsSinceLastSeen: Math.floor((now() - player.lastSeen) / 1000)
  }));
  res.json(allPlayers);
});

// Brainrots endpoint - sets a strict 30-second lifetime for the entry
app.post('/brainrots', (req, res) => {
  const data = req.body;
  const { name: rawName, serverId, jobId } = data;

  if (!rawName || typeof rawName !== "string" || !serverId || !jobId) {
    return res.status(400).json({ error: "Missing or invalid name, serverId, or jobId" });
  }

  const name = rawName.trim();
  const key = `${serverId}_${name.toLowerCase()}_${jobId}`;
  const source = req.ip?.includes('railway') || req.headers['x-forwarded-for']?.includes('railway') ? 'bot' : 'lua';

  // If a deletion timer already exists for this brainrot, clear it
  if (brainrotTimers.has(key)) {
    clearTimeout(brainrotTimers.get(key));
  }

  const entry = {
    name: name,
    serverId: serverId,
    jobId: jobId,
    players: data.players,
    moneyPerSec: data.moneyPerSec,
    lastSeen: now(),
    source: source
  };
  brainrots.set(key, entry);

  // Set a new timer to delete this specific brainrot after the TTL
  const timerId = setTimeout(() => {
    brainrots.delete(key);
    brainrotTimers.delete(key); // Clean up the timer map as well
  }, BRAINROT_TTL_MS);

  // Store the new timer's ID
  brainrotTimers.set(key, timerId);

  res.json({ success: true });
});

// Brainrots getter
app.get('/brainrots', (req, res) => {
  const allBrainrots = Array.from(brainrots.values());
  allBrainrots.sort((a, b) => b.lastSeen - a.lastSeen);
  res.json(allBrainrots);
});

// Admin endpoint to manually clear all brainrots
app.delete('/brainrots', (req, res) => {
  // Clear all scheduled deletion timers first
  for (const timerId of brainrotTimers.values()) {
    clearTimeout(timerId);
  }
  brainrotTimers.clear();
  
  const count = brainrots.size;
  brainrots.clear();
  res.json({ success: true, cleared: count });
});

// Endpoint to manually remove a specific brainrot
app.patch('/brainrots/leave', (req, res) => {
  let { name, serverId, jobId } = req.body;
  name = typeof name === "string" ? name.trim() : "";
  serverId = typeof serverId === "string" ? serverId.trim() : "";
  jobId = typeof jobId === "string" ? jobId.trim() : "";

  const key = `${serverId}_${name.toLowerCase()}_${jobId}`;
  
  // Clear any scheduled deletion for this key
  if (brainrotTimers.has(key)) {
    clearTimeout(brainrotTimers.get(key));
    brainrotTimers.delete(key);
  }

  const deleted = brainrots.delete(key);
  res.json({ success: deleted });
});

// Root health check endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>🧠 Precise TTL Brainrot Backend</h1>
    <p>Each 'brainrot' is automatically deleted <strong>${BRAINROT_TTL_MS / 1000} seconds</strong> after it is received or updated.</p>
    <p>Players are removed after <strong>${PLAYER_INACTIVITY_MS / 1000} seconds</strong> of inactivity.</p>
    <p><strong>Total Stored Brainrots:</strong> ${brainrots.size}</p>
    <p><strong>Total Stored Players:</strong> ${activePlayers.size}</p>
    <p><strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds</p>
    <hr>
    <p><a href="/brainrots">📊 View All Brainrots</a></p>
    <p><a href="/players/active">👥 View All Players</a></p>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Precise TTL Brainrot Backend running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] 💥 Brainrots will be deleted ${BRAINROT_TTL_MS / 1000} seconds after being set.`);
});

