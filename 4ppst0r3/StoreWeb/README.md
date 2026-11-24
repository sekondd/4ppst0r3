# 4ppst0r3

An iPhone-first catalogue for LiveContainer-compatible sources.

## Run

Serve this folder over HTTP:

```sh
python3 -m http.server 8080
```

Open `http://<your-computer-ip>:8080` on a device connected to the same Wi-Fi, or host the folder on a static HTTPS host.

## Features

- Today, Games, Apps, Sources and Search tabs
- Add, remove and refresh AltStore/AltSource-style JSON sources
- App pages with descriptions, screenshots and version information
- Search and category browsing
- LiveContainer source handoff via `livecontainer://source?url=...`
- Light and dark appearance, plus a home-screen icon

## Notes

- Source hosts must allow browser requests (CORS).
- The source list is stored in this browser, separately from LiveContainer.
- Opening a source hands it to LiveContainer; choose the app there to install it.
- This is a web app, not an IPA or a replacement for LiveContainer's native interface.
