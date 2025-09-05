const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// Memory stores with no automatic cleanup or limits
const brainrots = new Map();
const activePlayers = new Map();

function now() {
  return Date.now();
}

// Player heartbeat endpoint - stores player data indefinitely
app.post('/players/heartbeat', (req, res) => {
  const { username, serverId, jobId, placeId } = req.body;
  
  if (!username || !serverId || !jobId) {
    return res.status(400).json({ error: "Missing username, serverId, or jobId" });
  }
  
  // The key uniquely identifies a player instance in a specific server
  const key = `${username.toLowerCase()}_${serverId}_${jobId}`;
  
  // Store or update player data
  activePlayers.set(key, {
    username: username,
    serverId: serverId,
    jobId: jobId,
    placeId: placeId || serverId,
    lastSeen: now()
  });
  
  res.json({ success: true });
});

// Active players endpoint - returns all players
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

// Brainrots endpoint - stores data indefinitely
app.post('/brainrots', (req, res) => {
  const data = req.body;

  let name = typeof data.name === "string" ? data.name.trim() : "";
  let serverId = typeof data.serverId === "string" ? data.serverId.trim() : "";
  let jobId = typeof data.jobId === "string" ? data.jobId.trim() : "";

  if (!name || !serverId || !jobId) {
    return res.status(400).json({ error: "Missing name, serverId, or jobId" });
  }

  const source = req.ip?.includes('railway') || req.headers['x-forwarded-for']?.includes('railway') ? 'bot' : 'lua';
  const key = `${serverId}_${name.toLowerCase()}_${jobId}`;

  // Store data indefinitely
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

  res.json({ success: true });
});

// Brainrots getter - returns all stored brainrots
app.get('/brainrots', (req, res) => {
  // Return all brainrots, sorted by most recently seen
  const allBrainrots = Array.from(brainrots.values());
  allBrainrots.sort((a, b) => b.lastSeen - a.lastSeen);
  res.json(allBrainrots);
});

// Debug endpoint to show current state
app.get('/brainrots/debug', (req, res) => {
  const brainrotList = Array.from(brainrots.values()).map(br => ({
    name: br.name,
    serverId: br.serverId.substring(0, 12) + '...',
    jobId: br.jobId.substring(0, 12) + '...',
    players: br.players,
    moneyPerSec: br.moneyPerSec,
    secondsSinceLastSeen: Math.floor((now() - br.lastSeen) / 1000)
  }));
  
  // Sort by most recent and take a sample of 20 for the debug view
  brainrotList.sort((a, b) => a.secondsSinceLastSeen - b.secondsSinceLastSeen);

  const debugData = {
    summary: {
      totalStoredBrainrots: brainrots.size,
      totalStoredPlayers: activePlayers.size
    },
    brainrotsSample: brainrotList.slice(0, 20) // Show a sample to avoid huge response
  };

  res.json(debugData);
});

// Stats endpoint
app.get('/brainrots/stats', (req, res) => {
  let luaCount = 0;
  let botCount = 0;
  
  for (const br of brainrots.values()) {
      if (br.source === 'lua') luaCount++;
      else if (br.source === 'bot') botCount++;
  }

  res.json({
    totalBrainrots: brainrots.size,
    totalPlayers: activePlayers.size,
    bySource: {
      lua: luaCount,
      bot: botCount
    },
    uptime: Math.floor(process.uptime()),
  });
});

// Admin endpoint to manually clear all brainrots
app.delete('/brainrots', (req, res) => {
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
  const deleted = brainrots.delete(key);

  res.json({ success: deleted });
});

// Root health check endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>🧠 Unlimited Brainrot Backend</h1>
    <p>This server has no storage or time limits.</p>
    <p><strong>Total Stored Brainrots:</strong> ${brainrots.size}</p>
    <p><strong>Total Stored Players:</strong> ${activePlayers.size}</p>
    <p><strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds</p>
    <hr>
    <p><a href="/brainrots">📊 View All Brainrots</a></p>
    <p><a href="/players/active">👥 View All Players</a></p>
    <p><a href="/brainrots/debug">🔍 Debug Data</a></p>
    <p><a href="/brainrots/stats">📈 Statistics</a></p>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Unlimited Brainrot Backend running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] ⚠️ Server has NO MEMORY OR TIME LIMITS. Data will be stored until the server restarts.`);
});
