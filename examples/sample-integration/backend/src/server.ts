// MUF Sample Integration — token-minting backend
//
// One small Express app that signs JWTs against the same JWT_SECRET
// the MUF Engine signaling-server uses. The frontend calls these
// endpoints AFTER authenticating the user; the engine never sees the
// secret.
//
// Replace the mock `authenticateUser` with your real auth middleware
// (session cookie / OAuth / API key — whatever your stack uses).

import express, { type Request } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import 'dotenv/config';

const PORT       = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET is required — must match the value in MUF Engine\'s .env');
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// ── Mock auth ────────────────────────────────────────────────────────
// Every request gets a fake "user" with the display_name they sent in
// the body. In production, replace with your real auth middleware that
// pulls user identity from a session cookie / JWT / API key.
interface MockUser {
    id:          string;
    displayName: string;
    avatarUrl?:  string;
}
function authenticateUser(req: Request): MockUser {
    const displayName = (req.body?.displayName as string)?.trim() || 'Anonymous';
    const avatarUrl   = (req.body?.avatarUrl   as string)?.trim();
    return {
        id:          `user-${displayName.toLowerCase().replace(/\s+/g, '-')}`,
        displayName,
        avatarUrl,
    };
}

// ── POST /api/host-token ─────────────────────────────────────────────
// Mints a JWT for a user creating a new live stream. Returns:
//   - token: the JWT (paste into MufLiveManager via setTokenProvider)
//   - roomId: the room they should publish to
//   - peerId: the WebSocket peer_id they MUST use at WS Join time
// The peer_id IS the host_peer_id in the JWT — they must match for
// chat partitioning to work (L.9).
app.post('/api/host-token', (req, res) => {
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
    }, JWT_SECRET);

    res.json({ token, roomId, peerId: hostPeerId });
});

// ── POST /api/viewer-token ───────────────────────────────────────────
// Mints a viewer JWT for joining an existing stream. Caller passes:
//   - roomId      — from the share link
//   - hostPeerId  — from the share link's ?host= param (which audience)
app.post('/api/viewer-token', (req, res) => {
    const user = authenticateUser(req);
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
    }, JWT_SECRET);

    res.json({ token });
});

app.listen(PORT, () => {
    console.log(`MUF sample backend listening on http://localhost:${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  POST /api/host-token`);
    console.log(`  POST /api/viewer-token`);
});
