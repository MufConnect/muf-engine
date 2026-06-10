/**
 * MUF Meeting Room — production-style group video call wired to the live SDK.
 *
 * Architecture:
 *   - `core` (transport singleton) is configured once at module load.
 *   - `MufCallManager` is created per App mount; its events drive React state.
 *   - Pre-call screen (IDLE) → Start Host / Join Guest.
 *   - Meeting screen (ACTIVE) → tiles, control bar, people panel, recording.
 *
 * Stack:
 *   - React 18 (functional components, hooks)
 *   - TypeScript strict mode
 *   - Tailwind CSS for styling
 *   - lucide-react for icons
 *
 * SDK wired:
 *   ✓ setLocalAudioMute        ✓ startScreenShare / stopScreenShare
 *   ✓ setLocalVideoEnabled     ✓ startRecording / stopRecording
 *   ✓ startHost / joinCall     ✓ endCall (role-aware)
 *   ✓ Live STATE_CHANGE, PEER_JOINED/LEFT, LOCAL_*, RECORDING_*, ERROR
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, Users,
    MonitorUp, Send, Pin, Shield, Info, Signal,
    Copy, Check, ScreenShareOff, Settings, Download, Film,
} from 'lucide-react';

import { core } from '@muf/core';
import {
    MufCallManager,
    CallEvent,
} from '@muf/meeting';

// Module-scope singleton — survives React 18 StrictMode double-mount in dev.
// One per tab, reused across IDLE → ACTIVE → IDLE → ACTIVE cycles.
const manager = new MufCallManager();

// ─── Configure the transport singleton once at module load ───────────────────

const SIGNALING_HOST = import.meta.env.VITE_SIGNALING_HOST ?? 'wss://signal.your-domain.com/ws';
// Your backend's token-mint endpoint. The browser NEVER holds the org key —
// it only ever talks to your server, which signs a short-lived room token.
// Point this at the sample token backend (examples/sample-integration/backend),
// which exposes POST /api/host-token. See that example for the server code.
const TOKEN_BACKEND        = import.meta.env.VITE_TOKEN_BACKEND        ?? '/api/host-token';
const VIEWER_TOKEN_BACKEND = import.meta.env.VITE_VIEWER_TOKEN_BACKEND ?? '/api/viewer-token';

core.configure({ signalingHost: SIGNALING_HOST });

// The token provider is registered once at module load. App.tsx writes the
// host's typed-in identity here just before calling manager.startHost().
// SECURITY: a real integration authenticates the user on YOUR backend and
// derives identity from your trusted user record — never trust the browser
// for identity in production. The org key stays server-side; the browser
// only ever receives a short-lived room token.
const pendingHostIdentity: { displayName: string; avatarUrl: string } = { displayName: '', avatarUrl: '' };

core.setTokenProvider(async (opts: { isPublic?: boolean; maxPeers?: number }) => {
    const body: Record<string, unknown> = { public: opts.isPublic ?? false };
    if (opts.maxPeers !== undefined) body.maxPeers = opts.maxPeers;
    // Demo only: identity is passed from the UI input. In production your
    // backend pulls it from the authenticated session, not the request body.
    if (pendingHostIdentity.displayName) body.displayName = pendingHostIdentity.displayName;
    if (pendingHostIdentity.avatarUrl)   body.avatarUrl   = pendingHostIdentity.avatarUrl;
    const r = await fetch(TOKEN_BACKEND, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`token mint failed: HTTP ${r.status} ${text}`);
    }
    const data = await r.json();
    // Only the room token + ids reach the browser — never the org key or any
    // host secret. The backend keeps those server-side.
    return { roomId: data.roomId ?? data.room_id, token: data.token, peerId: data.peerId };
});

// ─── Types & helpers ─────────────────────────────────────────────────────────

type Toast = { id: number; level: 'info' | 'warn' | 'danger'; message: string };
type Panel = 'people' | 'chat' | null;

type ChatMsg = {
    id:        string;
    from:      string;
    text:      string;
    at:        number;
    isOwn:     boolean;
    avatarUrl?: string | null;
    system?:   { kind: 'recording'; downloadUrl: string };
};

const IDENTITY_KEY = 'muf.meeting.identity.v1';

const fmtDuration = (ms: number): string => {
    const s   = Math.max(0, Math.floor(ms / 1000));
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const fmtClockTime = (d: Date): string =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Deterministic avatar color from a string (so the same name always picks the same hue).
const TONES = ['#2c5282', '#276749', '#6b3a64', '#7a5a2e', '#2c5a6e', '#7c2d12', '#365314', '#3730a3'];
const toneFor = (seed: string): string => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return TONES[h % TONES.length];
};

const initialsFor = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
    // ── Call lifecycle state (SDK-driven) ──────────────────────────────────
    const [callState,         setCallState]         = useState<'IDLE' | 'INITIALIZING' | 'ACTIVE' | 'ENDING'>('IDLE');
    const [isHost,            setIsHost]            = useState(false);
    const [callStartedAt,     setCallStartedAt]     = useState<number | null>(null);
    const [inviteLink,        setInviteLink]        = useState<string | null>(null);
    const [localStream,       setLocalStream]       = useState<MediaStream | null>(null);
    const [remoteStream,      setRemoteStream]      = useState<MediaStream | null>(null);
    const [localAudioMuted,   setLocalAudioMuted]   = useState(false);
    const [localVideoEnabled, setLocalVideoEnabled] = useState(true);
    const [isScreenSharing,   setIsScreenSharing]   = useState(false);
    const [isRecording,       setIsRecording]       = useState(false);
    const [recordingStartAt,  setRecordingStartAt]  = useState<number | null>(null);
    const [peers,             setPeers]             = useState<string[]>([]);
    const [peerDisplayName,   setPeerDisplayName]   = useState<string>('');
    const [recordings,        setRecordings]        = useState<Array<{ id: string; url: string; at: number }>>([]);
    const [connectionState,   setConnectionState]   = useState<string>('connected');
    const [chatMessages,      setChatMessages]      = useState<ChatMsg[]>([]);
    const [peerTyping,        setPeerTyping]        = useState(false);

    // ── Auto-join from `?room=` deep-link + persisted identity ─────────────
    const [autoJoinRoomId,    setAutoJoinRoomId]    = useState<string | null>(null);
    // Both host and guest read/write the same localStorage entry — your name
    // doesn't change based on which side of the call you're on.
    const [guestDisplayName,  setGuestDisplayName]  = useState<string>('');
    const [guestAvatarUrl,    setGuestAvatarUrl]    = useState<string>('');
    // `showHostIdentityPrompt` toggles the HostStartScreen pre-call branch.
    const [showHostIdentityPrompt, setShowHostIdentityPrompt] = useState(false);

    // ── UI-only state ──────────────────────────────────────────────────────
    const [activePanel,       setActivePanel]       = useState<Panel>(null);
    const [pinnedTile,        setPinnedTile]        = useState<'local' | 'remote' | null>(null);
    const [speakerMuted,      setSpeakerMuted]      = useState(true); // default-muted for autoplay
    const [toast,             setToast]             = useState<Toast | null>(null);
    const [now,               setNow]               = useState(Date.now());
    const [linkInput,         setLinkInput]         = useState('');
    const [copiedLink,        setCopiedLink]        = useState(false);
    const [settingsOpen,      setSettingsOpen]      = useState(false);

    // 1Hz ticker for live durations (call + recording).
    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    // Toast auto-dismiss.
    useEffect(() => {
        if (!toast) return;
        const t = window.setTimeout(() => setToast(null), 6000);
        return () => clearTimeout(t);
    }, [toast]);

    const showToast = useCallback((level: Toast['level'], message: string) => {
        setToast({ id: Date.now(), level, message });
    }, []);

    // ── Wire SDK events ────────────────────────────────────────────────────
    useEffect(() => {
        const offs: Array<() => void> = [];

        offs.push(manager.on(CallEvent.LOCAL_STREAM,  ({ stream }) => setLocalStream(stream)));
        offs.push(manager.on(CallEvent.REMOTE_STREAM, ({ stream }) => setRemoteStream(stream)));

        offs.push(manager.on(CallEvent.INVITE_LINK, ({ link }: { link: string }) => {
            setInviteLink(link);
            setLinkInput(link);
        }));

        offs.push(manager.on(CallEvent.STATE_CHANGE, ({ state }: { state: typeof callState }) => {
            setCallState(state);
            setIsHost(manager.isHost);
            if (state === 'ACTIVE' && callStartedAt === null) {
                setCallStartedAt(Date.now());
                setLocalAudioMuted(manager.localAudioMuted);
                setLocalVideoEnabled(manager.localVideoEnabled);
            } else if (state === 'IDLE') {
                setCallStartedAt(null);
                setLocalStream(null);
                setRemoteStream(null);
                setIsRecording(false);
                setRecordingStartAt(null);
                setIsScreenSharing(false);
                setLocalAudioMuted(false);
                setLocalVideoEnabled(true);
                setPeers([]);
                setPeerDisplayName('');
                setPinnedTile(null);
                setActivePanel(null);
                setInviteLink(null);
                setRecordings([]);
                setChatMessages([]);
                setPeerTyping(false);
            }
        }));

        offs.push(manager.on(CallEvent.PEER_JOINED, ({ peerId, displayName }: { peerId: string; displayName?: string | null }) => {
            setPeers((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
            const name = displayName?.trim() ?? '';
            if (name) setPeerDisplayName(name);
            const who = name || (manager.isHost ? 'Guest' : 'Peer');
            showToast('info', `${who} joined the meeting`);
        }));

        offs.push(manager.on(CallEvent.PEER_LEFT, ({ peerId, displayName }: { peerId: string; displayName?: string | null }) => {
            setPeers((prev) => prev.filter((p) => p !== peerId));
            // Pick the freshest name we know: server-supplied (preferred) or the
            // one we cached on PEER_JOINED — the server-side is removed before
            // broadcast so a stale-cache fallback covers reconnect/race cases.
            const who = displayName?.trim() || peerDisplayName.trim();
            if (manager.isHost) showToast('info', `${who || 'Guest'} left the meeting`);
            else                showToast('warn', `${who || 'Host'} ended the meeting`);
            setPeerDisplayName('');
        }));

        offs.push(manager.on(CallEvent.RECORDING_STARTED, ({ recordingId }: { recordingId: string }) => {
            setIsRecording(true);
            setRecordingStartAt(Date.now());
            showToast('info', `Recording started · ${recordingId.slice(0, 8)}`);
        }));
        offs.push(manager.on(CallEvent.RECORDING_STOPPED, ({ recordingId, url }: { recordingId: string; url: string }) => {
            setIsRecording(false);
            setRecordingStartAt(null);
            setRecordings((prev) => [...prev, { id: recordingId, url, at: Date.now() }]);
            showToast('info', 'Recording saved');
            setChatMessages((prev) => [
                ...prev,
                {
                    id:     `rec-${recordingId}`,
                    from:   'System',
                    text:   'Recording ready',
                    at:     Date.now(),
                    isOwn:  false,
                    system: { kind: 'recording', downloadUrl: url },
                },
            ]);
        }));
        offs.push(manager.on(CallEvent.RECORDING_FAILED, ({ message }: { message: string }) => {
            setIsRecording(false);
            setRecordingStartAt(null);
            showToast('danger', `Recording failed: ${message}`);
        }));

        offs.push(manager.on(CallEvent.LOCAL_AUDIO_MUTE,    ({ muted   }: { muted: boolean })   => setLocalAudioMuted(muted)));
        offs.push(manager.on(CallEvent.LOCAL_VIDEO_ENABLED, ({ enabled }: { enabled: boolean }) => setLocalVideoEnabled(enabled)));
        offs.push(manager.on(CallEvent.SCREEN_SHARING,      ({ active  }: { active: boolean })  => setIsScreenSharing(active)));

        offs.push(manager.on(CallEvent.ERROR, (err: Error) => {
            showToast('danger', err.message ?? 'Unknown error');
        }));

        offs.push(manager.on(CallEvent.CHAT, ({ from, text, avatarUrl }: { from: string; text: string; avatarUrl?: string | null }) => {
            setChatMessages((prev) => [
                ...prev,
                { id: `${Date.now()}-${Math.random()}`, from, text, at: Date.now(), isOwn: false, avatarUrl: avatarUrl ?? null },
            ]);
        }));

        offs.push(manager.on(CallEvent.TYPING, ({ typing }) => setPeerTyping(typing)));

        offs.push(manager.on(CallEvent.CONNECTION_CHANGE, ({ connectionState: cs, prevConnectionState: prev }) => {
            setConnectionState(cs);
            if (cs === 'reconnecting' && prev === 'connected') {
                showToast('warn', 'Connection lost — reconnecting…');
            } else if (cs === 'connected' && prev === 'reconnecting') {
                showToast('info', 'Reconnected');
            }
        }));

        // CoreEvent.NEW_PRODUCER currently used only to track the most recent remote
        // producer for quality control — wire if needed by future features.

        return () => { for (const off of offs) off(); };
        // We intentionally exclude state setters (stable per React) and `manager` (stable ref).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Allow remote audio to play once we have a user gesture (browser autoplay policy).
    // Anywhere on the page click flips speakerMuted=false the first time.
    useEffect(() => {
        const handler = () => setSpeakerMuted(false);
        document.body.addEventListener('click', handler, { once: true });
        return () => document.body.removeEventListener('click', handler);
    }, []);

    // Auto-promote: when local user starts screen share, pin the local
    // tile so the screen content fills the main view; when stopped, restore default.
    // (Remote-side auto-promote needs a server broadcast — Phase 5 follow-up.)
    useEffect(() => {
        if (isScreenSharing) setPinnedTile('local');
        else if (pinnedTile === 'local') setPinnedTile(null);
        // pinnedTile dep intentionally omitted — only react to share state change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isScreenSharing]);

    // ── Actions ────────────────────────────────────────────────────────────
    const startHost = useCallback(async (displayName: string, avatarUrl: string) => {
        // Persist + push identity to the token-provider closure so /create_room
        // embeds it in the host's JWT. Same localStorage key as the guest path.
        try {
            localStorage.setItem(IDENTITY_KEY, JSON.stringify({ displayName, avatarUrl }));
        } catch { /* quota / private mode — non-fatal */ }
        pendingHostIdentity.displayName = displayName;
        pendingHostIdentity.avatarUrl   = avatarUrl;

        setShowHostIdentityPrompt(false);
        try { await manager.startHost(); }
        catch (e) { showToast('danger', `Start meeting failed: ${(e as Error).message}`); }
    }, [showToast]);

    const joinAsGuest = useCallback(async (link: string) => {
        const trimmed = link.trim();
        if (!trimmed) { showToast('warn', 'Paste an invite link first'); return; }

        let guestLink = trimmed;
        try {
            const url    = new URL(trimmed);
            const roomId = url.searchParams.get('room');
            if (!roomId) throw new Error('invite link missing ?room=');
            // Mint the viewer token via YOUR backend — the org key stays
            // server-side; the browser only receives the short-lived token.
            const tokenResp = await fetch(VIEWER_TOKEN_BACKEND, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ roomId }),
            });
            if (!tokenResp.ok) {
                const text = await tokenResp.text().catch(() => '');
                throw new Error(`viewer-token failed: HTTP ${tokenResp.status} ${text}`);
            }
            const { token: viewerToken } = await tokenResp.json();
            guestLink = `${url.origin}${url.pathname}?room=${roomId}&token=${viewerToken}`;
        } catch (e) {
            showToast('danger', `Could not get viewer token: ${(e as Error).message}`);
            return;
        }
        try { await manager.joinCall(guestLink); }
        catch (e) { showToast('danger', `Join failed: ${(e as Error).message}`); }
    }, [showToast]);

    const joinAsAutoGuest = useCallback(async (roomId: string, displayName: string, avatarUrl: string) => {
        try {
            localStorage.setItem(IDENTITY_KEY, JSON.stringify({ displayName, avatarUrl }));
        } catch { /* quota / private mode — non-fatal */ }

        let viewerToken: string;
        try {
            // Mint via YOUR backend (org key server-side). Demo passes identity
            // from the UI; production derives it from the authenticated session.
            const resp = await fetch(VIEWER_TOKEN_BACKEND, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ roomId, displayName, avatarUrl }),
            });
            if (!resp.ok) {
                const text = await resp.text().catch(() => '');
                throw new Error(`HTTP ${resp.status} ${text}`);
            }
            viewerToken = (await resp.json()).token;
        } catch (e) {
            showToast('danger', `Could not get viewer token: ${(e as Error).message}`);
            return;
        }

        const guestLink = `${window.location.origin}${window.location.pathname}?room=${roomId}&token=${viewerToken}`;
        try { await manager.joinCall(guestLink); }
        catch (e) { showToast('danger', `Join failed: ${(e as Error).message}`); }
    }, [showToast]);

    const toggleMic = useCallback(async () => {
        try { await manager.setLocalAudioMute(!localAudioMuted); }
        catch (e) { showToast('danger', (e as Error).message); }
    }, [localAudioMuted, showToast]);

    const toggleCamera = useCallback(async () => {
        try { await manager.setLocalVideoEnabled(!localVideoEnabled); }
        catch (e) { showToast('danger', (e as Error).message); }
    }, [localVideoEnabled, showToast]);

    const toggleScreenShare = useCallback(async () => {
        try {
            if (isScreenSharing) await manager.stopScreenShare();
            else                 await manager.startScreenShare();
        } catch (e) {
            showToast('danger', `Screen share: ${(e as Error).message}`);
        }
    }, [isScreenSharing, showToast]);

    const toggleRecording = useCallback(async () => {
        try {
            if (isRecording) {
                // Stopping inside the first ~2 seconds means FFmpeg never sees a
                // keyframe and produces a 596-byte header-only WebM that players
                // can't render. Block here so the user gets a clear hint instead
                // of a broken download link.
                const elapsedMs = recordingStartAt ? Date.now() - recordingStartAt : 0;
                if (elapsedMs < 2000) {
                    showToast('warn', `Wait a moment before stopping — recordings under 2s capture no video`);
                    return;
                }
                // Fire-and-forget — UI flips state immediately, the final URL arrives
                // later via the RECORDING_STOPPED broadcast and lands in the tray.
                manager.stopRecording();
                setIsRecording(false);
                setRecordingStartAt(null);
                showToast('info', 'Recording stop sent — file will appear in tray when ready');
            } else {
                await manager.startRecording();
            }
        } catch (e) {
            showToast('danger', `Recording: ${(e as Error).message}`);
        }
    }, [isRecording, recordingStartAt, showToast]);

    const leaveOrEnd = useCallback(async () => {
        if (manager.isHost) {
            const ok = window.confirm('End the meeting for everyone?');
            if (!ok) return;
        }
        try { await manager.endCall(); }
        catch (e) { showToast('danger', `Leave failed: ${(e as Error).message}`); }
    }, [showToast]);

    const copyInvite = useCallback(async () => {
        if (!inviteLink) return;
        try {
            await navigator.clipboard.writeText(inviteLink);
            setCopiedLink(true);
            window.setTimeout(() => setCopiedLink(false), 2000);
        } catch {
            showToast('warn', 'Clipboard blocked — copy manually');
        }
    }, [inviteLink, showToast]);

    // ── Auto-join from `?room=` deep-link ──────────────────────────────────
    // Note: we do NOT use `manager.checkAutoJoin()` — that helper reuses the
    // host's single-use token from the URL, which the signaling server rejects.
    // Instead we capture the room id, prompt for guest identity, and mint a
    // fresh viewer token via /viewer-token (see joinAsAutoGuest below).
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            setAutoJoinRoomId(room);
            window.history.replaceState({}, '', window.location.pathname);
        }
        try {
            const raw = localStorage.getItem(IDENTITY_KEY);
            if (raw) {
                const v = JSON.parse(raw);
                if (typeof v.displayName === 'string') setGuestDisplayName(v.displayName);
                if (typeof v.avatarUrl   === 'string') setGuestAvatarUrl(v.avatarUrl);
            }
        } catch { /* ignore corrupt JSON */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Derived ────────────────────────────────────────────────────────────
    const callDurationMs      = callStartedAt    !== null ? now - callStartedAt    : 0;
    const recordingDurationMs = recordingStartAt !== null ? now - recordingStartAt : 0;
    const inMeeting           = callState === 'ACTIVE';
    // "Peer is in the room" — true once PEER_JOINED fires OR remote media arrives.
    // A peer with no camera/mic still counts; their tile shows an avatar.
    const hasRemote           = remoteStream !== null || peers.length > 0;
    const hasLocalAudio       = localStream  !== null && localStream.getAudioTracks().length > 0;
    const hasLocalVideo       = localStream  !== null && localStream.getVideoTracks().length > 0;

    // Names — both host and guest persist their identity in the same localStorage
    // entry, so `guestDisplayName` here is just "the local user's name" regardless
    // of role. Real customer integrations ship authenticated identity from their
    // own auth — this typed-in input is a developer-demo concession.
    const localName = guestDisplayName.trim();
    const myName    = localName
        ? `${localName} (You)`
        : (isHost ? 'You (Host)' : 'You');
    const peerName  = peerDisplayName.trim() || (isHost ? 'Guest' : 'Host');
    const peerSeed  = peerDisplayName.trim() || peers[0] || 'peer';

    // ── Render ─────────────────────────────────────────────────────────────
    if (!inMeeting) {
        if (autoJoinRoomId) {
            return <JoinAsGuestScreen
                state={callState}
                roomId={autoJoinRoomId}
                displayName={guestDisplayName}
                avatarUrl={guestAvatarUrl}
                onDisplayNameChange={setGuestDisplayName}
                onAvatarUrlChange={setGuestAvatarUrl}
                onJoin={() => joinAsAutoGuest(autoJoinRoomId, guestDisplayName.trim(), guestAvatarUrl.trim())}
                onCancel={() => setAutoJoinRoomId(null)}
                toast={toast}
            />;
        }
        if (showHostIdentityPrompt) {
            return <HostStartScreen
                state={callState}
                displayName={guestDisplayName}
                avatarUrl={guestAvatarUrl}
                onDisplayNameChange={setGuestDisplayName}
                onAvatarUrlChange={setGuestAvatarUrl}
                onStart={() => startHost(guestDisplayName.trim(), guestAvatarUrl.trim())}
                onCancel={() => setShowHostIdentityPrompt(false)}
                toast={toast}
            />;
        }
        return <PreCallScreen
            state={callState}
            inviteLink={inviteLink}
            linkInput={linkInput}
            onLinkInput={setLinkInput}
            onStartHost={() => setShowHostIdentityPrompt(true)}
            onJoinGuest={joinAsGuest}
            onCopyLink={copyInvite}
            copiedLink={copiedLink}
            toast={toast}
        />;
    }

    return (
        <div className="fixed inset-0 bg-meet-bg text-[#e8eaed] flex flex-col font-sans">

            {/* Top status strip */}
            <TopStrip
                isRecording={isRecording}
                recordingDurationMs={recordingDurationMs}
                callDurationMs={callDurationMs}
                connectionState={connectionState}
            />

            {/* Toast */}
            {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

            {/* Stage */}
            <main className="flex-1 flex gap-2 p-2 min-h-0">
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <Stage
                        localStream={localStream}
                        remoteStream={remoteStream}
                        localAudioMuted={localAudioMuted}
                        localVideoEnabled={localVideoEnabled}
                        speakerMuted={speakerMuted}
                        myName={myName}
                        peerName={peerName}
                        peerSeed={peerSeed}
                        isHost={isHost}
                        hasRemote={hasRemote}
                        isScreenSharing={isScreenSharing}
                        pinnedTile={pinnedTile}
                        onPin={setPinnedTile}
                    />
                </div>

                {activePanel === 'people' && (
                    <PeoplePanel
                        myName={myName}
                        peerName={peerName}
                        peerSeed={peerSeed}
                        isHost={isHost}
                        localAudioMuted={localAudioMuted}
                        peers={peers}
                        onClose={() => setActivePanel(null)}
                    />
                )}
                {activePanel === 'chat' && (
                    <ChatPanel
                        messages={chatMessages}
                        peerTyping={peerTyping}
                        onSend={(text) => {
                            const trimmed = text.trim();
                            if (!trimmed) return;
                            // Optimistic local render — manager.sendChat doesn't echo own messages.
                            setChatMessages((prev) => [
                                ...prev,
                                { id: `${Date.now()}-self`, from: 'You', text: trimmed, at: Date.now(), isOwn: true } satisfies ChatMsg,
                            ]);
                            try { manager.sendChat(trimmed); }
                            catch (e) { showToast('warn', `Chat: ${(e as Error).message}`); }
                        }}
                        onTyping={() => { try { manager.notifyTyping(); } catch { /* no-op */ } }}
                        onClose={() => setActivePanel(null)}
                    />
                )}
            </main>

            {/* Recordings tray */}
            {recordings.length > 0 && (
                <RecordingsTray recordings={recordings} onDismiss={(id) => setRecordings((prev) => prev.filter((r) => r.id !== id))} />
            )}

            {/* Bottom control bar */}
            <ControlBar
                isHost={isHost}
                localAudioMuted={localAudioMuted}
                localVideoEnabled={localVideoEnabled}
                hasLocalAudio={hasLocalAudio}
                hasLocalVideo={hasLocalVideo}
                isScreenSharing={isScreenSharing}
                isRecording={isRecording}
                speakerMuted={speakerMuted}
                activePanel={activePanel}
                onToggleMic={toggleMic}
                onToggleCamera={toggleCamera}
                onToggleScreen={toggleScreenShare}
                onToggleRecording={toggleRecording}
                onToggleSpeaker={() => setSpeakerMuted((s) => !s)}
                onLeave={leaveOrEnd}
                onTogglePanel={(p) => setActivePanel((curr) => (curr === p ? null : p))}
                onOpenSettings={() => setSettingsOpen(true)}
                onCopyInvite={copyInvite}
                copiedLink={copiedLink}
            />

            {settingsOpen && (
                <SettingsModal
                    onClose={() => setSettingsOpen(false)}
                    onAudioDeviceChange={(id) =>
                        manager.setAudioInputDevice(id).catch((e) => showToast('danger', `Mic switch: ${(e as Error).message}`))
                    }
                    onVideoDeviceChange={(id) =>
                        manager.setVideoInputDevice(id).catch((e) => showToast('danger', `Camera switch: ${(e as Error).message}`))
                    }
                />
            )}
        </div>
    );
}

// ─── Pre-call screen ─────────────────────────────────────────────────────────

function PreCallScreen(props: {
    state:        string;
    inviteLink:   string | null;
    linkInput:    string;
    onLinkInput:  (v: string) => void;
    onStartHost:  () => void;
    onJoinGuest:  (link: string) => void;
    onCopyLink:   () => void;
    copiedLink:   boolean;
    toast:        Toast | null;
}) {
    const initializing = props.state === 'INITIALIZING' || props.state === 'ENDING';
    return (
        <div className="fixed inset-0 bg-meet-bg text-[#e8eaed] flex flex-col items-center justify-center font-sans px-6">
            {props.toast && <ToastBanner toast={props.toast} />}

            <div className="w-full max-w-xl space-y-8">
                <header className="text-center space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight">MUF Meeting</h1>
                    <p className="text-white/50 text-sm">Start a new meeting or join with an invite link</p>
                </header>

                <section className="bg-meet-surface rounded-xl p-6 space-y-3">
                    <h2 className="text-sm font-medium text-white/70 uppercase tracking-wide">Start a new meeting</h2>
                    <button
                        onClick={props.onStartHost}
                        disabled={initializing}
                        className="w-full h-12 rounded-lg bg-meet-accentBg text-[#202124] font-medium hover:bg-meet-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {initializing ? 'Starting…' : 'Start as host'}
                    </button>
                    {props.inviteLink && (
                        <div className="flex items-center gap-2 bg-meet-elev rounded-lg px-3 py-2">
                            <input
                                readOnly
                                value={props.inviteLink}
                                className="flex-1 bg-transparent outline-none text-xs font-mono text-white/70"
                                onClick={(e) => e.currentTarget.select()}
                            />
                            <button
                                onClick={props.onCopyLink}
                                className="text-[#a8c7fa] hover:text-white p-1 rounded transition"
                                title="Copy invite link"
                            >
                                {props.copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    )}
                </section>

                <section className="bg-meet-surface rounded-xl p-6 space-y-3">
                    <h2 className="text-sm font-medium text-white/70 uppercase tracking-wide">Join with a link</h2>
                    <input
                        type="text"
                        placeholder="Paste invite link…"
                        value={props.linkInput}
                        onChange={(e) => props.onLinkInput(e.target.value)}
                        className="w-full h-11 px-4 rounded-lg bg-meet-elev text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-meet-accent"
                    />
                    <button
                        onClick={() => props.onJoinGuest(props.linkInput)}
                        disabled={initializing || !props.linkInput.trim()}
                        className="w-full h-12 rounded-lg bg-meet-elev text-white font-medium hover:bg-meet-elev2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {initializing ? 'Joining…' : 'Join meeting'}
                    </button>
                </section>
            </div>
        </div>
    );
}

// ─── Join-as-guest screen (deep-link flow) ──────────────────────────────────

function JoinAsGuestScreen(props: {
    state:               string;
    roomId:              string;
    displayName:         string;
    avatarUrl:           string;
    onDisplayNameChange: (v: string) => void;
    onAvatarUrlChange:   (v: string) => void;
    onJoin:              () => void;
    onCancel:            () => void;
    toast:               Toast | null;
}) {
    const initializing  = props.state === 'INITIALIZING' || props.state === 'ENDING';
    const canJoin       = !initializing && props.displayName.trim().length > 0;
    const previewSeed   = props.displayName.trim() || 'guest';
    const previewLetter = initialsFor(previewSeed);

    return (
        <div className="fixed inset-0 bg-meet-bg text-[#e8eaed] flex flex-col items-center justify-center font-sans px-6">
            {props.toast && <ToastBanner toast={props.toast} />}

            <div className="w-full max-w-md space-y-6">
                <header className="text-center space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">You're joining a MUF meeting</h1>
                    <p className="text-white/50 text-xs font-mono break-all">Room {props.roomId}</p>
                </header>

                <section className="bg-meet-surface rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        {props.avatarUrl.trim() ? (
                            <img
                                src={props.avatarUrl}
                                alt=""
                                className="w-12 h-12 rounded-full object-cover bg-meet-elev"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                            />
                        ) : (
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-base font-semibold"
                                style={{ background: toneFor(previewSeed) }}
                            >
                                {previewLetter}
                            </div>
                        )}
                        <div className="text-sm text-white/70">
                            Joining as <span className="text-white font-medium">{props.displayName.trim() || '—'}</span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="guest-name" className="block text-[11px] font-medium text-white/60 uppercase tracking-wide">Your name</label>
                        <input
                            id="guest-name"
                            type="text"
                            placeholder="e.g. Alex Kim"
                            autoFocus
                            value={props.displayName}
                            onChange={(e) => props.onDisplayNameChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) props.onJoin(); }}
                            className="w-full h-11 px-4 rounded-lg bg-meet-elev text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-meet-accent"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="guest-avatar" className="block text-[11px] font-medium text-white/60 uppercase tracking-wide">
                            Avatar URL <span className="text-white/40 normal-case">(optional)</span>
                        </label>
                        <input
                            id="guest-avatar"
                            type="text"
                            placeholder="https://…"
                            value={props.avatarUrl}
                            onChange={(e) => props.onAvatarUrlChange(e.target.value)}
                            className="w-full h-11 px-4 rounded-lg bg-meet-elev text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-meet-accent"
                        />
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={props.onJoin}
                            disabled={!canJoin}
                            className="flex-1 h-12 rounded-lg bg-meet-accentBg text-[#202124] font-medium hover:bg-meet-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {initializing ? 'Joining…' : 'Join meeting'}
                        </button>
                        <button
                            onClick={props.onCancel}
                            disabled={initializing}
                            className="h-12 px-5 rounded-lg bg-meet-elev text-white/80 hover:bg-meet-elev2 transition disabled:opacity-40"
                        >
                            Cancel
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}

// ─── Host start screen (identity prompt before opening a new meeting) ───────

function HostStartScreen(props: {
    state:               string;
    displayName:         string;
    avatarUrl:           string;
    onDisplayNameChange: (v: string) => void;
    onAvatarUrlChange:   (v: string) => void;
    onStart:             () => void;
    onCancel:            () => void;
    toast:               Toast | null;
}) {
    const initializing  = props.state === 'INITIALIZING' || props.state === 'ENDING';
    const canStart      = !initializing && props.displayName.trim().length > 0;
    const previewSeed   = props.displayName.trim() || 'host';
    const previewLetter = initialsFor(previewSeed);

    return (
        <div className="fixed inset-0 bg-meet-bg text-[#e8eaed] flex flex-col items-center justify-center font-sans px-6">
            {props.toast && <ToastBanner toast={props.toast} />}

            <div className="w-full max-w-md space-y-6">
                <header className="text-center space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">Start a new meeting</h1>
                    <p className="text-white/50 text-sm">Tell guests who's hosting</p>
                </header>

                <section className="bg-meet-surface rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        {props.avatarUrl.trim() ? (
                            <img
                                src={props.avatarUrl}
                                alt=""
                                className="w-12 h-12 rounded-full object-cover bg-meet-elev"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                            />
                        ) : (
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-base font-semibold"
                                style={{ background: toneFor(previewSeed) }}
                            >
                                {previewLetter}
                            </div>
                        )}
                        <div className="text-sm text-white/70">
                            Hosting as <span className="text-white font-medium">{props.displayName.trim() || '—'}</span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="host-name" className="block text-[11px] font-medium text-white/60 uppercase tracking-wide">Your name</label>
                        <input
                            id="host-name"
                            type="text"
                            placeholder="e.g. Alex Kim"
                            autoFocus
                            value={props.displayName}
                            onChange={(e) => props.onDisplayNameChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && canStart) props.onStart(); }}
                            className="w-full h-11 px-4 rounded-lg bg-meet-elev text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-meet-accent"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="host-avatar" className="block text-[11px] font-medium text-white/60 uppercase tracking-wide">
                            Avatar URL <span className="text-white/40 normal-case">(optional)</span>
                        </label>
                        <input
                            id="host-avatar"
                            type="text"
                            placeholder="https://…"
                            value={props.avatarUrl}
                            onChange={(e) => props.onAvatarUrlChange(e.target.value)}
                            className="w-full h-11 px-4 rounded-lg bg-meet-elev text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-meet-accent"
                        />
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={props.onStart}
                            disabled={!canStart}
                            className="flex-1 h-12 rounded-lg bg-meet-accentBg text-[#202124] font-medium hover:bg-meet-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {initializing ? 'Starting…' : 'Start meeting'}
                        </button>
                        <button
                            onClick={props.onCancel}
                            disabled={initializing}
                            className="h-12 px-5 rounded-lg bg-meet-elev text-white/80 hover:bg-meet-elev2 transition disabled:opacity-40"
                        >
                            Cancel
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}

// ─── Top status strip ────────────────────────────────────────────────────────

function TopStrip(props: {
    isRecording:         boolean;
    recordingDurationMs: number;
    callDurationMs:      number;
    connectionState:     string;
}) {
    const conn = (() => {
        switch (props.connectionState) {
            case 'connected':    return { color: 'text-emerald-400', label: 'Connected'     };
            case 'connecting':   return { color: 'text-amber-400',   label: 'Connecting…'   };
            case 'reconnecting': return { color: 'text-amber-400',   label: 'Reconnecting…' };
            case 'closing':      return { color: 'text-rose-400',    label: 'Closing'       };
            case 'disconnected': return { color: 'text-rose-400',    label: 'Disconnected'  };
            default:             return { color: 'text-white/40',    label: props.connectionState };
        }
    })();
    return (
        <div className="h-9 px-4 flex items-center justify-between text-xs bg-meet-bg border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3 text-white/60">
                {props.isRecording ? (
                    <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="font-medium text-red-400">Recording</span>
                        <span className="text-white/30">·</span>
                        <span className="tabular-nums">{fmtDuration(props.recordingDurationMs)}</span>
                    </span>
                ) : (
                    <span className="text-white/40">Not recording</span>
                )}
            </div>
            <div className="flex items-center gap-3 text-white/60">
                <span className="flex items-center gap-1">
                    <Signal className={`w-3 h-3 ${conn.color}`} />
                    <span className={conn.color}>{conn.label}</span>
                </span>
                <span className="text-white/30">·</span>
                <span className="tabular-nums">{fmtDuration(props.callDurationMs)}</span>
            </div>
        </div>
    );
}

// ─── Toast banner ────────────────────────────────────────────────────────────

function ToastBanner({ toast, onClose }: { toast: Toast; onClose?: () => void }) {
    const tone =
        toast.level === 'danger' ? 'bg-meet-danger/90 border-meet-danger text-white'
      : toast.level === 'warn'   ? 'bg-amber-600/90 border-amber-500   text-white'
      :                            'bg-meet-elev/95  border-white/10    text-white';
    return (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50">
            <div className={`px-4 py-2 rounded-lg border shadow-lg text-sm font-medium flex items-center gap-3 ${tone}`}>
                <span>{toast.message}</span>
                {onClose && (
                    <button onClick={onClose} className="text-white/70 hover:text-white">×</button>
                )}
            </div>
        </div>
    );
}

// ─── Stage (tile layout) ─────────────────────────────────────────────────────

function Stage(props: {
    localStream:       MediaStream | null;
    remoteStream:      MediaStream | null;
    localAudioMuted:   boolean;
    localVideoEnabled: boolean;
    speakerMuted:      boolean;
    myName:            string;
    peerName:          string;
    peerSeed:          string;
    isHost:            boolean;
    hasRemote:         boolean;
    isScreenSharing:   boolean;
    pinnedTile:        'local' | 'remote' | null;
    onPin:             (t: 'local' | 'remote' | null) => void;
}) {
    const remote = (
        <VideoTile
            key="remote"
            kind="remote"
            stream={props.remoteStream}
            speakerMuted={props.speakerMuted}
            name={props.peerName}
            tone={toneFor(props.peerSeed)}
            initials={initialsFor(props.peerName)}
            isHost={!props.isHost}                    // remote is host iff I am guest
            isYou={false}
            cameraEnabled={true}
            muted={false}
            sharingScreen={false}
            pinned={props.pinnedTile === 'remote'}
            onPin={() => props.onPin(props.pinnedTile === 'remote' ? null : 'remote')}
        />
    );

    const local = (
        <VideoTile
            key="local"
            kind="local"
            stream={props.localStream}
            speakerMuted={true}
            name={props.myName}
            tone={toneFor('me')}
            initials={initialsFor(props.myName)}
            isHost={props.isHost}
            isYou={true}
            cameraEnabled={props.localVideoEnabled || props.isScreenSharing}
            muted={props.localAudioMuted}
            sharingScreen={props.isScreenSharing}
            pinned={props.pinnedTile === 'local'}
            onPin={() => props.onPin(props.pinnedTile === 'local' ? null : 'local')}
        />
    );

    if (!props.hasRemote) {
        // Solo — host waiting for guest, OR guest waiting for host stream to arrive.
        const helper = props.isHost ? 'Waiting for guest to join…' : 'Connecting to host…';
        return (
            <div className="flex-1 grid place-items-center min-h-0">
                <div className="w-[min(720px,100%)] aspect-video">{local}</div>
                <p className="mt-4 text-white/50 text-sm">{helper}</p>
            </div>
        );
    }

    if (props.pinnedTile) {
        const pinned = props.pinnedTile === 'local' ? local : remote;
        const other  = props.pinnedTile === 'local' ? remote : local;
        return (
            <>
                <div className="flex-1 min-h-0">{pinned}</div>
                <div className="h-24 flex gap-2 shrink-0">
                    <div className="aspect-video h-full">{other}</div>
                </div>
            </>
        );
    }

    return (
        <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
            {remote}
            {local}
        </div>
    );
}

// ─── Video tile ──────────────────────────────────────────────────────────────

function VideoTile(props: {
    kind:           'local' | 'remote';
    stream:         MediaStream | null;
    speakerMuted:   boolean;
    name:           string;
    tone:           string;
    initials:       string;
    isHost:         boolean;
    isYou:          boolean;
    cameraEnabled:  boolean;
    muted:          boolean;
    sharingScreen:  boolean;
    pinned:         boolean;
    onPin:          () => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Bind stream → video element via ref. React doesn't have a `srcObject` prop.
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        if (el.srcObject !== props.stream) el.srcObject = props.stream;
    }, [props.stream]);

    const showVideo = props.cameraEnabled && props.stream !== null && props.stream.getVideoTracks().length > 0;

    return (
        <div className="relative w-full h-full rounded-lg overflow-hidden bg-meet-surface group ring-1 ring-white/5">
            {showVideo ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={props.kind === 'local' || props.speakerMuted}
                    className="absolute inset-0 w-full h-full object-cover"
                />
            ) : (
                // Camera-off avatar: animated subtle gradient with centered initials.
                <>
                    <div
                        className="absolute inset-0 animate-camPulse"
                        style={{
                            background: `radial-gradient(ellipse at 50% 40%, ${props.tone} 0%, ${props.tone}99 45%, #1a1a1a 100%)`,
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/30 pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center font-medium text-white border border-white/10 w-24 h-24 text-3xl">
                            {props.initials}
                        </div>
                    </div>
                </>
            )}

            {/* Top-right: connection + pin */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
                <div className="w-7 h-7 rounded-md bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <Signal className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <button
                    onClick={props.onPin}
                    className={`w-7 h-7 rounded-md bg-black/40 backdrop-blur-sm flex items-center justify-center text-white transition ${
                        props.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title={props.pinned ? 'Unpin' : 'Pin to main'}
                >
                    <Pin className={`w-3.5 h-3.5 ${props.pinned ? 'fill-white' : ''}`} />
                </button>
            </div>

            {/* Top-left: HOST badge + sharing-screen badge */}
            <div className="absolute top-2 left-2 flex gap-1">
                {props.isHost && (
                    <div className="px-2 py-0.5 rounded bg-black/50 backdrop-blur-sm text-[10px] font-semibold tracking-wide text-white/90">
                        HOST
                    </div>
                )}
                {props.sharingScreen && (
                    <div className="px-2 py-0.5 rounded bg-meet-accentBg/80 backdrop-blur-sm text-[10px] font-semibold tracking-wide text-[#202124]">
                        SHARING SCREEN
                    </div>
                )}
            </div>

            {/* Bottom-left: name + mic */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/55 backdrop-blur-sm">
                {props.muted
                    ? <MicOff className="w-3.5 h-3.5 text-meet-danger" />
                    : <Mic    className="w-3.5 h-3.5 text-white/80" />}
                <span className="text-xs font-medium">
                    {props.isYou ? 'You' : props.name}
                </span>
            </div>
        </div>
    );
}

// ─── People panel ────────────────────────────────────────────────────────────

function PeoplePanel(props: {
    myName:           string;
    peerName:         string;
    peerSeed:         string;
    isHost:           boolean;
    localAudioMuted:  boolean;
    peers:            string[];
    onClose:          () => void;
}) {
    const me = { name: props.myName, isYou: true,  isHost: props.isHost,  muted: props.localAudioMuted, seed: 'me' };
    const remotePeers = props.peers.map((peerId) => ({
        name:   props.peerName,
        isYou:  false,
        isHost: !props.isHost,
        muted:  false, // remote mic state not yet plumbed — Phase 5
        seed:   peerId,
    }));
    const all = [me, ...remotePeers];
    return (
        <aside className="w-[320px] bg-meet-surface rounded-lg flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
                <h2 className="text-sm font-medium">People ({all.length})</h2>
                <button onClick={props.onClose} className="text-white/60 hover:text-white text-xl leading-none w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center">×</button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
                <div className="px-4 py-2 text-[10px] font-medium text-white/50 uppercase tracking-wide">In meeting</div>
                {all.map((p) => (
                    <div key={p.seed} className="px-4 py-2 flex items-center gap-3 hover:bg-white/5">
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                            style={{ background: toneFor(p.seed) }}
                        >
                            {initialsFor(p.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] flex items-center gap-2">
                                <span className="truncate">{p.isYou ? 'You' : p.name}</span>
                                {p.isHost && <span className="text-[10px] text-white/50">Host</span>}
                            </div>
                        </div>
                        {p.muted ? <MicOff className="w-4 h-4 text-white/40" /> : <Mic className="w-4 h-4 text-white/40" />}
                    </div>
                ))}
            </div>
        </aside>
    );
}

// ─── Chat panel ──────────────────────────────────────────────────────────────

function ChatPanel(props: {
    messages:   ChatMsg[];
    peerTyping: boolean;
    onSend:     (text: string) => void;
    onTyping:   () => void;
    onClose:    () => void;
}) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the latest message whenever messages change.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [props.messages.length, props.peerTyping]);

    const handleSend = () => {
        const text = input.trim();
        if (!text) return;
        props.onSend(text);
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <aside className="w-[320px] bg-meet-surface rounded-lg flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
                <h2 className="text-sm font-medium">In-call messages</h2>
                <button
                    onClick={props.onClose}
                    className="text-white/60 hover:text-white text-xl leading-none w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center"
                >×</button>
            </div>
            <div className="px-4 py-2 text-[11px] text-white/50 border-b border-white/5 shrink-0">
                Messages are deleted when the meeting ends
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {props.messages.length === 0 && !props.peerTyping && (
                    <div className="text-center text-xs text-white/40 py-8">
                        No messages yet — say hi
                    </div>
                )}
                {props.messages.map((m, idx) => {
                    if (m.system?.kind === 'recording') {
                        return (
                            <div
                                key={m.id}
                                className="rounded-lg bg-meet-elev px-3 py-2.5 flex items-center gap-3 border border-white/5"
                            >
                                <Film className="w-4 h-4 text-meet-accent shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[12px] text-white/80 font-medium">{m.text}</div>
                                    <div className="text-[10px] text-white/40">
                                        {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <a
                                    href={m.system.downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[12px] font-medium text-meet-accent hover:text-white px-2.5 py-1 rounded-md hover:bg-white/5 transition shrink-0"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                </a>
                            </div>
                        );
                    }
                    // Group consecutive messages from the same sender — only the first
                    // in a run shows the avatar + sender label, like Messenger does.
                    const prev      = props.messages[idx - 1];
                    const sameAsPrev = prev && !prev.system && prev.isOwn === m.isOwn && prev.from === m.from;
                    const showHeader = !sameAsPrev;
                    const tone       = toneFor(m.from);
                    const initials   = initialsFor(m.from);
                    const time       = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    if (m.isOwn) {
                        return (
                            <div key={m.id} className={`flex justify-end ${sameAsPrev ? 'mt-0.5' : 'mt-1.5'}`}>
                                <div
                                    className="max-w-[78%] px-3 py-1.5 rounded-2xl rounded-br-md bg-meet-accentBg text-[#202124]"
                                    title={time}
                                >
                                    <div className="text-[13px] leading-snug break-words whitespace-pre-wrap">{m.text}</div>
                                    <div className="text-[10px] text-[#202124]/55 text-right mt-0.5">{time}</div>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={m.id} className={`flex items-end gap-2 ${sameAsPrev ? 'mt-0.5' : 'mt-1.5'}`}>
                            <div className="w-7 shrink-0">
                                {showHeader && (
                                    m.avatarUrl ? (
                                        <img
                                            src={m.avatarUrl}
                                            alt=""
                                            className="w-7 h-7 rounded-full object-cover bg-meet-elev"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                                        />
                                    ) : (
                                        <div
                                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
                                            style={{ background: tone }}
                                        >
                                            {initials}
                                        </div>
                                    )
                                )}
                            </div>
                            <div className="max-w-[78%]">
                                {showHeader && (
                                    <div className="text-[11px] text-white/55 mb-0.5 ml-1">{m.from}</div>
                                )}
                                <div
                                    className="px-3 py-1.5 rounded-2xl rounded-bl-md bg-meet-elev text-white"
                                    title={time}
                                >
                                    <div className="text-[13px] leading-snug break-words whitespace-pre-wrap">{m.text}</div>
                                    <div className="text-[10px] text-white/40 mt-0.5">{time}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {props.peerTyping && (
                    <div className="text-xs text-white/50 italic">Peer is typing…</div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-white/5 shrink-0">
                <div className="flex items-center gap-2 bg-meet-elev rounded-full px-4 py-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => { setInput(e.target.value); props.onTyping(); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Send a message"
                        className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-white/40 text-white"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="text-meet-accent hover:text-white disabled:text-white/30 transition"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}

// ─── Settings modal ──────────────────────────────────────────────────────────

function SettingsModal(props: {
    onClose:             () => void;
    onAudioDeviceChange: (deviceId: string) => void;
    onVideoDeviceChange: (deviceId: string) => void;
}) {
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudio, setSelectedAudio] = useState<string>('');
    const [selectedVideo, setSelectedVideo] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Need an active getUserMedia grant for device labels to populate.
                // Permissions are already granted (we're in a meeting), so labels appear.
                const devices = await navigator.mediaDevices.enumerateDevices();
                if (cancelled) return;
                const audio = devices.filter((d) => d.kind === 'audioinput');
                const video = devices.filter((d) => d.kind === 'videoinput');
                setAudioDevices(audio);
                setVideoDevices(video);
                if (audio[0]) setSelectedAudio(audio[0].deviceId);
                if (video[0]) setSelectedVideo(video[0].deviceId);
            } catch (e) {
                setError((e as Error).message);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={props.onClose}
        >
            <div
                className="bg-meet-surface rounded-xl w-full max-w-md p-6 space-y-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">Settings</h2>
                    <button
                        onClick={props.onClose}
                        className="text-white/60 hover:text-white text-xl leading-none w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center"
                    >×</button>
                </header>

                {error ? (
                    <p className="text-sm text-rose-400">Could not enumerate devices: {error}</p>
                ) : (
                    <>
                        <div className="space-y-2">
                            <label htmlFor="setting-mic" className="block text-xs font-medium text-white/60 uppercase tracking-wide">Microphone</label>
                            <select
                                id="setting-mic"
                                className="w-full h-10 px-3 rounded-lg bg-meet-elev text-sm text-white outline-none focus:ring-2 focus:ring-meet-accent"
                                value={selectedAudio}
                                onChange={(e) => {
                                    setSelectedAudio(e.target.value);
                                    props.onAudioDeviceChange(e.target.value);
                                }}
                            >
                                {audioDevices.length === 0 && <option value="">No microphones found</option>}
                                {audioDevices.map((d) => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                        {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="setting-cam" className="block text-xs font-medium text-white/60 uppercase tracking-wide">Camera</label>
                            <select
                                id="setting-cam"
                                className="w-full h-10 px-3 rounded-lg bg-meet-elev text-sm text-white outline-none focus:ring-2 focus:ring-meet-accent"
                                value={selectedVideo}
                                onChange={(e) => {
                                    setSelectedVideo(e.target.value);
                                    props.onVideoDeviceChange(e.target.value);
                                }}
                            >
                                {videoDevices.length === 0 && <option value="">No cameras found</option>}
                                {videoDevices.map((d) => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                        {d.label || `Camera (${d.deviceId.slice(0, 8)})`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <p className="text-xs text-white/40 leading-relaxed">
                            Changing devices replaces the live track without dropping the meeting.
                            If you don't see device labels, your browser hasn't released them yet —
                            grant mic/camera permission and reopen this dialog.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Recordings tray ─────────────────────────────────────────────────────────

function RecordingsTray(props: {
    recordings: Array<{ id: string; url: string; at: number }>;
    onDismiss:  (id: string) => void;
}) {
    return (
        <div className="px-4 py-2 bg-meet-surface border-t border-white/5 shrink-0">
            <div className="flex items-center gap-3 overflow-x-auto">
                <span className="text-[11px] uppercase tracking-wide text-white/50 font-medium shrink-0">Recordings</span>
                {props.recordings.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1 rounded bg-meet-elev shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-xs font-mono text-white/70">{r.id.slice(0, 8)}</span>
                        <span className="text-[11px] text-white/40">{new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium text-meet-accent hover:text-white transition px-2 py-0.5 rounded hover:bg-white/10"
                        >
                            Open ↗
                        </a>
                        <button
                            onClick={() => props.onDismiss(r.id)}
                            className="text-white/40 hover:text-white text-sm leading-none w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center"
                            title="Dismiss"
                        >×</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Control bar (bottom) ────────────────────────────────────────────────────

function ControlBar(props: {
    isHost:             boolean;
    localAudioMuted:    boolean;
    localVideoEnabled:  boolean;
    hasLocalAudio:      boolean;
    hasLocalVideo:      boolean;
    isScreenSharing:    boolean;
    isRecording:        boolean;
    speakerMuted:       boolean;
    activePanel:        Panel;
    onToggleMic:        () => void;
    onToggleCamera:     () => void;
    onToggleScreen:     () => void;
    onToggleRecording:  () => void;
    onToggleSpeaker:    () => void;
    onLeave:            () => void;
    onTogglePanel:      (p: 'people' | 'chat') => void;
    onOpenSettings:     () => void;
    onCopyInvite:       () => void;
    copiedLink:         boolean;
}) {
    const clockTime = useMemo(() => fmtClockTime(new Date()), []);
    return (
        <footer className="h-16 px-4 flex items-center justify-between bg-meet-bg border-t border-white/5 shrink-0">
            <div className="flex items-center gap-3 text-[13px] w-56 text-white/70">
                <span className="font-medium tabular-nums">{clockTime}</span>
                <button
                    onClick={props.onCopyInvite}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 transition text-xs"
                    title="Copy invite link"
                >
                    {props.copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{props.copiedLink ? 'Copied' : 'Copy link'}</span>
                </button>
            </div>

            <div className="flex items-center gap-1.5">
                <CtrlBtn
                    label={!props.hasLocalAudio ? 'No microphone' : props.localAudioMuted ? 'Unmute' : 'Mute'}
                    on={!props.localAudioMuted}
                    disabled={!props.hasLocalAudio}
                    onClick={props.onToggleMic}
                >
                    {!props.hasLocalAudio || props.localAudioMuted
                        ? <MicOff className="w-[18px] h-[18px]" />
                        : <Mic    className="w-[18px] h-[18px]" />}
                </CtrlBtn>
                <CtrlBtn
                    label={!props.hasLocalVideo ? 'No camera' : props.localVideoEnabled ? 'Stop video' : 'Start video'}
                    on={props.localVideoEnabled}
                    disabled={!props.hasLocalVideo}
                    onClick={props.onToggleCamera}
                >
                    {!props.hasLocalVideo || !props.localVideoEnabled
                        ? <VideoOff className="w-[18px] h-[18px]" />
                        : <Video    className="w-[18px] h-[18px]" />}
                </CtrlBtn>
                <CtrlBtn
                    label={props.isScreenSharing ? 'Stop sharing' : 'Share screen'}
                    on={!props.isScreenSharing}
                    onClick={props.onToggleScreen}
                >
                    {props.isScreenSharing ? <ScreenShareOff className="w-[18px] h-[18px]" /> : <MonitorUp className="w-[18px] h-[18px]" />}
                </CtrlBtn>
                {props.isHost && (
                    <CtrlBtn
                        label={props.isRecording ? 'Stop recording' : 'Start recording'}
                        on={!props.isRecording}
                        onClick={props.onToggleRecording}
                        recordingActive={props.isRecording}
                    >
                        <span className="w-3 h-3 rounded-full bg-current" />
                    </CtrlBtn>
                )}
                <CtrlBtn
                    label={props.speakerMuted ? 'Speaker is OFF — click to enable' : 'Speaker is ON — click to mute'}
                    on={!props.speakerMuted}
                    onClick={props.onToggleSpeaker}
                >
                    <span className="text-base leading-none">{props.speakerMuted ? '🔇' : '🔊'}</span>
                </CtrlBtn>
                <CtrlBtn label="Settings" on onClick={props.onOpenSettings}>
                    <Settings className="w-[18px] h-[18px]" />
                </CtrlBtn>

                <button
                    onClick={props.onLeave}
                    className="ml-2 px-4 h-11 rounded-full bg-meet-danger hover:bg-meet-dangerH transition flex items-center gap-2 text-[13px] font-medium text-white"
                >
                    <PhoneOff className="w-[18px] h-[18px]" />
                    {props.isHost ? 'End meeting' : 'Leave'}
                </button>
            </div>

            <div className="flex items-center gap-1 w-56 justify-end">
                <IconBtn title="Meeting info"><Info className="w-[18px] h-[18px]" /></IconBtn>
                {props.isHost && <IconBtn title="Host controls"><Shield className="w-[18px] h-[18px]" /></IconBtn>}
                <IconBtn
                    title="People"
                    active={props.activePanel === 'people'}
                    onClick={() => props.onTogglePanel('people')}
                >
                    <Users className="w-[18px] h-[18px]" />
                </IconBtn>
                <IconBtn
                    title="Chat"
                    active={props.activePanel === 'chat'}
                    onClick={() => props.onTogglePanel('chat')}
                >
                    <MessageSquare className="w-[18px] h-[18px]" />
                </IconBtn>
            </div>
        </footer>
    );
}

function CtrlBtn(props: {
    children:        ReactNode;
    onClick:         () => void;
    on:              boolean;
    label:           string;
    disabled?:       boolean;
    recordingActive?: boolean;
}) {
    const cls = props.disabled
        ? 'bg-meet-elev/40 text-white/40 cursor-not-allowed'
        : props.recordingActive
            ? 'bg-meet-danger hover:bg-meet-dangerH text-white'
            : props.on
                ? 'bg-meet-elev hover:bg-meet-elev2 text-white'
                : 'bg-meet-danger hover:bg-meet-dangerH text-white';
    return (
        <button
            onClick={props.disabled ? undefined : props.onClick}
            disabled={props.disabled}
            title={props.label}
            className={`h-11 w-11 rounded-full flex items-center justify-center transition ${cls}`}
        >
            {props.children}
        </button>
    );
}

function IconBtn(props: {
    children: ReactNode;
    onClick?: () => void;
    title:    string;
    active?:  boolean;
}) {
    return (
        <button
            onClick={props.onClick}
            title={props.title}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                props.active ? 'bg-meet-accentBg/20 text-meet-accent' : 'hover:bg-white/10 text-white/70'
            }`}
        >
            {props.children}
        </button>
    );
}
