// MUF Sample Integration — token-minting backend
//
// ⚠️ DEMO ONLY. This shows the SECURE token-mint pattern (the org key never
// reaches the browser — your backend signs short-lived room tokens). Before
// using anything like this in production, read the security notes inline:
// replace the mock auth with your real auth, lock CORS to your origins, and
// keep the rate limits.
//
// One small Express app that signs JWTs against the same JWT_SECRET the MUF
// Engine signaling service uses. The frontend calls these endpoints AFTER
// authenticating the user; the engine never sees the secret.

import express, { type Request } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import 'dotenv/config';

const PORT       = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET is required — must match the value in MUF Engine\'s .env');
    process.exit(1);
}

// CORS allowlist — set ALLOWED_ORIGINS (comma-separated) to your own front-end
// origins. NEVER ship a wildcard (`cors()`) in production: it lets any website
// mint tokens against your backend. Defaults to localhost for the demo only.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',').map((o) => o.trim()).filter(Boolean);

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Rate-limit the mint endpoints so a single origin/user can't flood them.
// Tune to your traffic; pair with a per-org quota on your side.
const mintLimiter = rateLimit({
    windowMs: 60_000,        // 1 minute
    max:      30,            // 30 mints / minute / IP
    standardHeaders: true,
    legacyHeaders: false,
});

// ── Mock auth ────────────────────────────────────────────────────────
// TODO: replace with your real auth middleware (session cookie / OAuth /
// API key). The key rule: identity (display name, avatar) must come from
// YOUR trusted user record — NEVER from the client request body, or anyone
// can spoof any identity. This mock simulates a logged-in user; it does
// NOT read req.body for identity.
interface MockUser {
    id:          string;
    displayName: string;
    avatarUrl?:  string;
}
function authenticateUser(_req: Request): MockUser {
    // In a real app: look up the authenticated session and return that user.
    // Hard-coded here so the example never trusts client-supplied identity.
    return {
        id:          'demo-user-1',
        displayName: 'Demo User',
        avatarUrl:   undefined,
    };
}

// ── POST /api/host-token ─────────────────────────────────────────────
// Mints a JWT for a user creating a new live stream. Returns:
//   - token: the JWT (paste into MufLiveManager via setTokenProvider)
//   - roomId: the room they should publish to
//   - peerId: the WebSocket peer_id they MUST use at WS Join time
// The peer_id IS the host_peer_id in the JWT — they must match for
// chat partitioning to work (L.9).
app.post('/api/host-token', mintLimiter, (req, res) => {
    const user        = authenticateUser(req);
    const roomId      = uuid();
    const hostPeerId  = uuid();

    const token = jwt.sign({
        room_id:          roomId,
        role:             'host',
        room_type:        'live',
        display_name:     user.displayName,
        avatar_url:       user.avatarUrl,
        is_original_host: true,
        host_peer_id:     hostPeerId,
        exp:              Math.floor(Date.now() / 1000) + 86400, // 24h
    }, JWT_SECRET, { algorithm: 'HS256' });   // pin the algorithm explicitly

    res.json({ token, roomId, peerId: hostPeerId });
});

// ── POST /api/viewer-token ───────────────────────────────────────────
// Mints a viewer JWT for joining an existing stream. Caller passes:
//   - roomId      — from the share link
//   - hostPeerId  — from the share link's ?host= param (which audience)
app.post('/api/viewer-token', mintLimiter, (req, res) => {
    const user = authenticateUser(req);
    // roomId / hostPeerId identify WHICH room — those legitimately come from
    // the share link. Identity (display_name/avatar) does NOT — it comes from
    // the authenticated user above, never the request body.
    const { roomId, hostPeerId } = req.body as { roomId?: string; hostPeerId?: string };

    if (!roomId) {
        return res.status(400).json({ error: 'roomId is required' });
    }

    const token = jwt.sign({
        room_id:      roomId,
        role:         'viewer',
        room_type:    'live',
        display_name: user.displayName,
        avatar_url:   user.avatarUrl,
        host_peer_id: hostPeerId,
        exp:          Math.floor(Date.now() / 1000) + 3600, // 1h
    }, JWT_SECRET, { algorithm: 'HS256' });   // pin the algorithm explicitly

    res.json({ token });
});

app.listen(PORT, () => {
    console.log(`MUF sample backend listening on http://localhost:${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  POST /api/host-token`);
    console.log(`  POST /api/viewer-token`);
});
