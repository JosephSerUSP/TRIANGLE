export default [
    {
        ignores: ["dist/**", "node_modules/**"]
    },
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
                console: "readonly",
                requestAnimationFrame: "readonly",
                performance: "readonly",
                setTimeout: "readonly",
                Float32Array: "readonly",
                Math: "readonly",
                AudioContext: "readonly",
                webkitAudioContext: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error"
        }
    }
];
