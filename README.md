# 🎵 Dupi - YT Music Playlist Organizer

[![Version](https://img.shields.io/badge/version-1.3.2-00f0ff.svg?style=flat-square)](https://github.com/AexZeM/yt-music-playlist-enhancer)
[![Platform](https://img.shields.io/badge/platform-Chrome-red.svg?style=flat-square)](https://music.youtube.com)
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg?style=flat-square)](LICENSE)

> Organize, search, tag, export, and clean up large YouTube Music playlists directly inside YouTube Music.

## Installation

### Option 1: Chrome Web Store (Recommended)

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Add_to_Chrome-blue?logo=googlechrome\&style=flat-square)](https://chromewebstore.google.com/detail/yt-music-playlist-enhance/aigenoggiahlkplokpmlhojfndombagg?authuser=0&hl=en)

### Option 2: Manual Installation

1. **Download** the repository as a ZIP file and extract it.
2. Open your browser's **Extension Settings** (`chrome://extensions`).
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the extracted folder.

## Key Features

* **Smart Tag System** — Categorize and filter your music with a custom tagging system.
* **Advanced Search** — Quickly find specific songs even in large playlists.
* **Duplicate Scanner** — Detect duplicate and related tracks by comparing playlist metadata, helping identify repeated songs and covers.
* **Export Your Data** — Export playlist data locally in `.md`, `.csv`, or `.json` formats for backup or sharing.
* **Custom Themes** — Choose from multiple built-in themes with a clean interface isolated from YouTube Music's own UI.

## About the Project

As my YouTube Music playlists grew, finding tracks, spotting duplicates and covers, and keeping everything organized became increasingly difficult.

I couldn't find an extension that solved these problems the way I wanted, so I built Dupi.

What started as a tool to solve my own frustrations has grown into my first major open-source project. I hope it makes managing large YouTube Music playlists easier for others too.

## How to Use

1. Navigate to [YouTube Music](https://music.youtube.com).
2. Open one of your playlists.
3. Dupi will automatically load and integrate directly into the page.
4. Use Dupi's tools to search, tag, scan for duplicates, export data, and organize your playlist.

### Large Playlists

Many operations require the entire playlist to be loaded first.

Dupi handles this automatically in the background by loading the remaining playlist entries before operations such as duplicate scanning or filtering. You don't need to manually scroll through the playlist.

## Privacy

Dupi is designed to keep playlist management local to your browser and does not collect or sell your personal data.
Some features may use external services such as the Last.fm API for music metadata when required.
For more information, see the project's [Privacy Policy](https://github.com/aexzem/ytm-playlist-organizer/blob/main/PRIVACY.md).

## Tech Stack

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge\&logo=javascript\&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge\&logo=html5\&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge\&logo=css3\&logoColor=white)
![Google Chrome](https://img.shields.io/badge/Chrome_Extension-4285F4?style=for-the-badge\&logo=google-chrome\&logoColor=white)
![Fuse.js](https://img.shields.io/badge/Fuse.js-343A40?style=for-the-badge)
![Last.fm API](https://img.shields.io/badge/Last.fm_API-D51007?style=for-the-badge\&logo=last.fm\&logoColor=white)

## Contributing

Bug reports, feature suggestions, and contributions are welcome.

If you encounter a problem or have an idea for Dupi, feel free to open an issue or submit a pull request.

### Local regression tests

With Node.js 22 or newer, run from the repository root:

```sh
node --test tests/*.test.cjs
```

No dependency installation is needed. Tests execute the extension source in an
isolated VM with fake DOM, clock, and Chrome storage objects. They cover duration
parsing, duplicate exclusions, deletion failures/timeouts/cancellation, modal
scroll cleanup, and Unicode tag migration. They never delete real playlist tracks,
write to browser storage, or call Last.fm. Passing them does not establish live
browser or server-side deletion correctness.

### Duplicate safety and tag storage

Duplicate comparisons require valid visible durations (`m:ss` or `h:mm:ss`).
Tracks with unknown durations are excluded and counted in the scan result.
Deletion stops at the first failure or unconfirmed removal and retains remaining
selections. Success means the target row disappeared from the same live playlist
container within five seconds; it is not a server-side persistence guarantee.

Tag identity now preserves Unicode, punctuation, case and internal whitespace,
using NFC-normalized, trimmed title/artist pairs. New manual tags are stored in
`ytme_manual_tags_v2`; snapshots use `ytme_snapshot_v2_<playlistId>`. Existing
manual records migrate only when their saved original title and artist match.
Existing v2 records take precedence, including deletion markers that prevent a
removed tag from being re-imported. Storage updates use a shared Web Lock across
YT Music tabs where supported, with a per-page queue as fallback.

Legacy storage is retained. Legacy snapshots cannot establish track identity and
are not restored; tags are recalculated by the existing pipeline. Tags already
overwritten by the old colliding keys cannot be recovered automatically. Clearing
the genre cache removes snapshots, but preserves manual tags and deletion markers.

## License

Dupi is licensed under the [MIT License](LICENSE).
