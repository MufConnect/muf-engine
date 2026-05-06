/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SIGNALING_HOST?: string;
    readonly VITE_API_BASE_URL?:   string;
    readonly VITE_MUF_ORG_ID?:     string;
    readonly VITE_MUF_ORG_KEY?:    string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
