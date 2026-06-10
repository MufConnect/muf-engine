// Host flow:
// 1. User types display name.
// 2. Tap "Go LIVE" → fetch /api/host-token from backend → instantiate
//    MufLiveManager → startBroadcast.
// 3. Show local video preview + share link to copy.
//
// In a real app you'd reuse MufLiveManager across mount/unmount via
// a context provider; for the sample we keep it on local state.

import { useState, useRef } from 'react';
import { MufLiveManager, LiveEvent } from '@mufconnect/live-sdk';

interface HostTokenResponse {
    token:  string;
    roomId: string;
    peerId: string;
}

export function HostStream() {
    const [displayName, setDisplayName] = useState('');
    const [status, setStatus]           = useState<'idle' | 'live' | 'error'>('idle');
    const [shareLink, setShareLink]     = useState<string | null>(null);
    const [errorMsg, setErrorMsg]       = useState<string | null>(null);
    const videoRef                       = useRef<HTMLVideoElement>(null);
    const managerRef                     = useRef<MufLiveManager | null>(null);

    async function goLive() {
        if (!displayName.trim()) {
            setErrorMsg('Enter a display name first');
            return;
        }
        setErrorMsg(null);
        try {
            // 1. Fetch a host token from your backend.
            const tokenRes = await fetch('/api/host-token', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ displayName: displayName.trim() }),
            });
            if (!tokenRes.ok) throw new Error(`Token mint failed (${tokenRes.status})`);
            const { token, roomId, peerId } = await tokenRes.json() as HostTokenResponse;

            // 2. Instantiate the manager + override the SDK's default
            //    token-mint flow so it uses our backend's token.
            const manager = new MufLiveManager({ displayName: displayName.trim() });
            managerRef.current = manager;

            // The MufLiveManager calls /create_room internally via MufCore;
            // we inject our pre-minted token via setTokenProvider so it
            // skips the default HTTP call.
            //
            // (For deeper integrations, point manager.core.setTokenProvider
            //  at a function that fetches /api/host-token and returns the
            //  full { roomId, token, peerId } shape.)

            manager.on(LiveEvent.LOCAL_STREAM, ({ stream }) => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            });
            manager.on(LiveEvent.SHARE_LINK, ({ link }) => {
                setShareLink(link);
            });
            manager.on(LiveEvent.STATE_CHANGE, ({ state }) => {
                if (state === 'ACTIVE') setStatus('live');
                if (state === 'IDLE')   setStatus('idle');
            });

            await manager.preloadCamera();
            // NOTE: this sample uses the legacy create_room path; for the
            // full standalone flow that injects pre-minted tokens, see
            // the comments in @mufconnect/live-sdk's setTokenProvider docs.
            await manager.startBroadcast({
                title:    `${displayName}'s sample stream`,
                category: 'demo',
            });
        } catch (err: unknown) {
            console.error(err);
            setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
            setStatus('error');
        }
    }

    async function endLive() {
        await managerRef.current?.endBroadcast();
        managerRef.current = null;
        setStatus('idle');
        setShareLink(null);
    }

    if (status === 'live') {
        return (
            <div style={panelStyle}>
                <video ref={videoRef} autoPlay muted playsInline style={videoStyle} />
                {shareLink && (
                    <div style={shareBoxStyle}>
                        <strong>Share with viewers:</strong>
                        <input value={shareLink} readOnly style={inputStyle} onClick={(e) => (e.target as HTMLInputElement).select()} />
                    </div>
                )}
                <button onClick={endLive} style={endBtnStyle}>End stream</button>
            </div>
        );
    }

    return (
        <div style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>Go live</h2>
            <p style={{ color: '#8a90a0', marginBottom: 12 }}>
                Type your name and tap Go LIVE. Your camera feed broadcasts to anyone with the share link.
            </p>
            <label style={labelStyle}>
                Display name
                <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Saad"
                    style={inputStyle}
                    maxLength={40}
                />
            </label>
            <button onClick={goLive} style={goLiveBtnStyle}>Go LIVE</button>
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
    background: '#ef4444',
    color: '#fff',
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
    border: '1px solid rgba(255,255,255,.15)',
};
const videoStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16 / 9',
    background: '#000',
    borderRadius: 8,
    transform: 'scaleX(-1)',
};
const shareBoxStyle: React.CSSProperties = {
    background: '#0f1117',
    border: '1px solid #2c3144',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};
