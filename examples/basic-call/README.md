# MUF Basic Call Example

End-to-end TypeScript example exercising both `@muf/core` and `@muf/meeting`.

## Run

```bash
# From the repo root, install workspace deps once:
npm install

# Then start the example:
cd examples/basic-call
npm run dev
```

Open <http://127.0.0.1:5173>. Click **Start as Host** in window A; copy the invite link into window B and click **Join as Guest**. You should see local + remote video within seconds.

## Configuration

Override the signaling endpoint without editing source:

```bash
VITE_SIGNALING_HOST=wss://signal.your-domain.com/ws \
VITE_API_BASE_URL=https://signal.your-domain.com \
npm run dev
```

Defaults to your `signal.your-domain.com` endpoint over WSS + HTTPS.

## What this demonstrates

- **Configuring `core`** — single import, no DOM coupling on the transport layer
- **Hosting / joining** — `manager.startHost()`, `manager.joinCall(link)`
- **Stream wiring** — `LOCAL_STREAM` / `REMOTE_STREAM` events to `<video>` elements
- **Consumer-side mute** — `manager.mutePeerAudio(producerId, true)`
- **SVC quality control** — `manager.setVideoQuality(producerId, 'low' | 'high')`
- **Server-side recording** — `manager.startRecording()` / `manager.stopRecording()` (host only)
- **Direct-link join** — `manager.checkAutoJoin()` reads `?room=&token=` automatically
