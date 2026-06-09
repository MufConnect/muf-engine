/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SIGNALING_HOST?:        string;
    // Your backend's token-mint endpoints. The browser never holds an org key.
    readonly VITE_TOKEN_BACKEND?:         string;
    readonly VITE_VIEWER_TOKEN_BACKEND?:  string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
