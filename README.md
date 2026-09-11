# Gridscape

Gridscape is an infinite spatial canvas for exploring interconnected concepts with AI-generated text and contextual imagery.

## Web development

```bash
npm install
npm run dev
```

The development server uses `server.ts` and serves the Vite app plus the `/api/*` endpoints.

## Android / APK

Gridscape uses Capacitor to package the Vite frontend as an Android app. The Android platform is generated during GitHub Actions so the repository stays lightweight.

```bash
npm install
npm run build:web
npx cap add android
npx cap sync android
```

The APK needs a publicly reachable HTTPS Gridscape API server because Gemini credentials must remain server-side. Set `VITE_API_BASE_URL` to that API URL when building the APK.

### GitHub Actions

Run **Build Gridscape Android APK** from the Actions tab. For manual runs, provide the public API URL and choose `debug` or `release`. The resulting APK is uploaded as an Actions artifact.

For automatic `push` builds, create a repository variable named `VITE_API_BASE_URL` containing the public HTTPS API URL.
