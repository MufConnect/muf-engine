// MUF Sample Integration — frontend root.
//
// Two screens controlled by URL params:
//   - default:           Host page — fetches /api/host-token, broadcasts.
//   - ?room=X&host=Y:    Viewer page — fetches /api/viewer-token, watches.
//
// In production you'd use a router; for a single-file sample the URL
// query check is enough to demonstrate the two integration paths.

import { useEffect, useState } from 'react';
import { HostStream } from './HostStream';
import { ViewerStream } from './ViewerStream';

export function App() {
    const [mode, setMode] = useState<'host' | 'viewer'>('host');
    const [roomId, setRoomId] = useState<string | null>(null);
    const [hostPeerId, setHostPeerId] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        const host = params.get('host');
        if (room) {
            setMode('viewer');
            setRoomId(room);
            setHostPeerId(host);
        }
    }, []);

    return (
        <div style={appStyle}>
            <header style={headerStyle}>
                <h1 style={{ margin: 0, fontSize: '1.25rem' }}>MUF Engine — Sample Integration</h1>
                <a
                    href="https://docs.mufconnect.com"
                    target="_blank"
                    rel="noopener"
                    style={{ color: '#22d3ee', textDecoration: 'none', fontSize: '.85rem' }}
                >
                    Docs ↗
                </a>
            </header>
            <main style={mainStyle}>
                {mode === 'host'
                    ? <HostStream />
                    : <ViewerStream roomId={roomId!} hostPeerId={hostPeerId} />
                }
            </main>
        </div>
    );
}

const appStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#0f1117',
    color: '#e8eaf0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
};
const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 24px',
    borderBottom: '1px solid #1f2230',
};
const mainStyle: React.CSSProperties = {
    flex: 1,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
};
