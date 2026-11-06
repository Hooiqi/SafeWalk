# SafeWalk mobile app (Flutter)

Student and staff app. Module 1 (live trip sharing and ETA monitoring) is
implemented; Modules 2 and 3 add their screens here later.

## Run

1. Start Supabase and the SafeWalk server (see the root `README.md`).
2. Copy `env/dev.example.json` to `env/dev.json` and fill in the values.
   On the Android emulator `10.0.2.2` is your computer's `localhost`; on a
   real phone use your computer's LAN IP.
3. Run:

```bash
flutter pub get
```

```bash
flutter run --dart-define-from-file=env/dev.json
```

## Test

```bash
flutter analyze
```

```bash
flutter test
```

## Structure

| Path | Purpose |
|---|---|
| `lib/core/` | Config (`--dart-define`), palette theme, API client, formatting |
| `lib/data/` | JSON models and repositories for the Node API |
| `lib/services/` | Supabase auth, GPS, Socket.io, FCM, and `TripTracker` |
| `lib/features/` | Screens: auth, home, journey, contacts, history, profile |
| `lib/widgets/` | Shared widgets (OpenStreetMap map, status badge, states) |

`TripTracker` streams GPS samples and a 20-second heartbeat to the server,
buffers samples while offline and uploads them over HTTP when the connection
returns. The ETA countdown and escalation decisions are made by the server
watchdog; the app only displays them.

Background location uses an Android foreground service (visible notification)
and iOS background location mode; both are declared in the platform manifests.
Push notifications are optional (FCM dart-defines).

Maps use `flutter_map`, the Dart counterpart of Leaflet, with OpenStreetMap
tiles (the React apps use Leaflet itself).
