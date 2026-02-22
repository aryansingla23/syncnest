# SyncNest (Watch Party MVP)

Link-based watch-party web app with:

- Real-time room joining via shareable URL
- Shared timeline controls (play, pause, seek, speed)
- Group chat in each room
- Browser audio/video calling via WebRTC mesh
- Date Night Mode for long-distance couples:
  - shared vibe/mood status
  - synced relationship question cards
  - shared love-note wall
  - instant heart/kiss/hug reactions
- Shared streaming link for platform URLs (Netflix/Prime/Disney/etc.)
- Optional synced direct-video player for URLs that the browser can play (`.mp4`, `.webm`, etc.)

## Quick start

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Notes on "watch anything"

Major streaming platforms do not allow third-party apps to directly control their player or rebroadcast DRM-protected content.  
This app handles that legally by:

- Sharing the official title URL to everyone in the room
- Syncing a common session timeline so people can stay time-matched
- Providing chat + audio/video call in the same room

For fully synced in-page playback, use a direct video URL in the demo player section.
