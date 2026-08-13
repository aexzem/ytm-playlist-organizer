# 🎵 Dupi - YT Music Playlist Organizer

[![Version](https://img.shields.io/badge/version-1.2.2-00f0ff.svg?style=flat-square)](https://github.com/AexZeM/yt-music-playlist-enhancer)
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

## License

Dupi is licensed under the [MIT License](LICENSE).
