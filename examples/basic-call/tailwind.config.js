/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                meet: {
                    bg:      '#1a1a1a',
                    surface: '#2a2a2a',
                    elev:    '#3c4043',
                    elev2:   '#4a4d50',
                    accent:  '#8ab4f8',
                    accentBg:'#a8c7fa',
                    danger:  '#ea4335',
                    dangerH: '#d33b2c',
                    warn:    '#fdd663',
                    warnH:   '#fcc934',
                },
            },
            keyframes: {
                voiceBar1: { '0%, 100%': { height: '30%' }, '50%': { height: '90%'  } },
                voiceBar2: { '0%, 100%': { height: '60%' }, '50%': { height: '40%'  } },
                voiceBar3: { '0%, 100%': { height: '40%' }, '50%': { height: '100%' } },
                camPulse:  { '0%, 100%': { opacity: '0.85' }, '50%': { opacity: '1' } },
                floatUp: {
                    '0%':   { transform: 'translateY(0)     scale(0.6)', opacity: '0' },
                    '15%':  { transform: 'translateY(-20px) scale(1)',   opacity: '1' },
                    '100%': { transform: 'translateY(-220px) scale(1)',  opacity: '0' },
                },
            },
            animation: {
                voiceBar1: 'voiceBar1 0.7s ease-in-out infinite',
                voiceBar2: 'voiceBar2 0.7s ease-in-out infinite',
                voiceBar3: 'voiceBar3 0.7s ease-in-out infinite',
                camPulse:  'camPulse 4s ease-in-out infinite',
                floatUp:   'floatUp 2.4s ease-out forwards',
            },
        },
    },
    plugins: [],
};
