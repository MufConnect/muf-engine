// Viewer flow:
// 1. Read roomId + hostPeerId from URL params (set by App.tsx).
// 2. User types display name, taps Watch.
// 3. Fetch /api/viewer-token from backend.
// 4. Instantiate MufLiveManager and joinAsViewer.
// 5. Render incoming video + chat.

import { useState, useRef, useEffect } from 'react';
import { MufLiveManager, LiveEvent } from '@muf/live-sdk';

interface ViewerTokenResponse { token: string }
interface ChatMessage          { from: string; displayName?: string; text: string; ts: number }

export function ViewerStream({ roomId, hostPeerId }: { roomId: string; hostPeerId: string | null }) {
    const [displayName, setDisplayName] = useState('');
    const [status, setStatus]           = useState<'idle' | 'watching' | 'error'>('idle');
    const [chat, setChat]               = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput]     = useState('');
    const [errorMsg, setErrorMsg]       = useState<string | null>(null);
    const videoRef                       = useRef<HTMLVideoElement>(null);
    const managerRef                     = useRef<MufLiveManager | null>(null);

    async function watch() {
        if (!displayName.trim()) {
            setErrorMsg('Enter a display name first');
            return;
        }
        setErrorMsg(null);
        try {
            const tokenRes = await fetch('/api/viewer-token', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    displayName: displayName.trim(),
                    roomId,
                    hostPeerId,
                }),
            });
            if (!tokenRes.ok) throw new Error(`Token mint failed (${tokenRes.status})`);
            await tokenRes.json() as ViewerTokenResponse;

            // For this sample we let MufLiveManager fetch its own token
            // via the SDK's default /viewer-token call (signaling-server
            // provides this endpoint). Backends that REPLACE the SDK's
            // token flow with their own would inject via setTokenProvider.
            const manager = new MufLiveManager({ displayName: displayName.trim() });
            managerRef.current = manager;

            manager.on(LiveEvent.REMOTE_STREAM, ({ kind, stream }) => {
                if (kind === 'video' && videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            });
            manager.on(LiveEvent.STATE_CHANGE, ({ state }) => {
                if (state === 'ACTIVE') setStatus('watching');
                if (state === 'IDLE')   setStatus('idle');
            });
            manager.on(LiveEvent.CHAT, ({ from, displayName: senderName, text }) => {
                setChat((prev) => [...prev, { from, displayName: senderName, text, ts: Date.now() }].slice(-30));
            });

            await manager.joinAsViewer(roomId, {
                displayName: displayName.trim(),
                hostPeerId:  hostPeerId ?? undefined,
            });
        } catch (err: unknown) {
            console.error(err);
            setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
            setStatus('error');
        }
    }

    async function leave() {
        await managerRef.current?.leaveStream();
        managerRef.current = null;
        setStatus('idle');
        setChat([]);
    }

    function sendChat() {
        const text = chatInput.trim();
        if (!text) return;
        managerRef.current?.sendChat(text);
        setChatInput('');
    }

    useEffect(() => {
        return () => {
            managerRef.current?.leaveStream().catch(() => {});
        };
    }, []);

    if (status === 'watching') {
        return (
            <div style={panelStyle}>
                <video ref={videoRef} autoPlay playsInline style={videoStyle} />
                <div style={chatBoxStyle}>
                    {chat.map((m) => (
                        <div key={m.ts}>
                            <strong style={{ color: '#fbbf24' }}>{m.displayName ?? m.from.slice(-4)}</strong>: {m.text}
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                        placeholder="Say something…"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={sendChat} style={{ ...goLiveBtnStyle, padding: '8px 16px' }}>Send</button>
                </div>
                <button onClick={leave} style={endBtnStyle}>Leave</button>
            </div>
        );
    }

    return (
        <div style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>Watch stream</h2>
            <p style={{ color: '#8a90a0' }}>
                Stream: <code>{roomId}</code><br />
                Host audience: <code>{hostPeerId ?? '(default — original host)'}</code>
            </p>
            <label style={labelStyle}>
                Display name (visible in chat)
                <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Viewer Name"
                    style={inputStyle}
                    maxLength={40}
                />
            </label>
            <button onClick={watch} style={goLiveBtnStyle}>Watch</button>
            {errorMsg && <p style={{ color: '#fb7185' }}>{errorMsg}</p>}
        </div>
    );
}

const panelStyle: React.CSSProperties = {
    background: '#1a1d27',
    border: '1px solid #1f2230',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};
const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: '.85rem',
    color: '#a8aebd',
};
const inputStyle: React.CSSProperties = {
    background: '#0f1117',
    border: '1px solid #2c3144',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#e8eaf0',
    fontSize: '.95rem',
};
const goLiveBtnStyle: React.CSSProperties = {
    background: '#22d3ee',
    color: '#0f1117',
    border: 'none',
    borderRadius: 999,
    padding: '14px 20px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
};
const endBtnStyle: React.CSSProperties = {
    ...goLiveBtnStyle,
    background: 'rgba(255,255,255,.1)',
    color: '#e8eaf0',
    border: '1px solid rgba(255,255,255,.15)',
};
const videoStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16 / 9',
    background: '#000',
    borderRadius: 8,
};
const chatBoxStyle: React.CSSProperties = {
    background: '#0f1117',
    border: '1px solid #2c3144',
    borderRadius: 8,
    padding: 12,
    height: 200,
    overflowY: 'auto',
    fontSize: '.85rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};
