# Gridscape Android APK

Gridscape is packaged as an Android app with Capacitor. The Android project is intentionally generated in GitHub Actions so the repository stays small and no Android SDK is required on the development phone.

## GitHub Actions

1. Push this project to a GitHub repository.
2. Open **Actions → Build Gridscape Android APK**.
3. Choose **Run workflow**.
4. For a normal APK choose `debug`.
5. If the AI backend is deployed, enter its public HTTPS URL in `api_base_url`, or create a repository variable named `VITE_API_BASE_URL`.
6. Open the completed workflow run and download the `Gridscape-debug-*` artifact.

A push to `main` automatically creates a debug APK. Manual `release` builds create a signed APK with an ephemeral CI key. That key is not suitable for publishing updates to Google Play; use a persistent signing key stored in GitHub Secrets for production releases.

## API backend

The APK is a web app inside an Android WebView. It does not automatically run the Express `server.ts` backend. Deploy the backend separately and set:

`VITE_API_BASE_URL=https://your-api.example.com`

Do not put a Gemini API key into the APK. Keep provider credentials on the backend.
