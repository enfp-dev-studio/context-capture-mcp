# Vision Context MCP 👁️

> **Stop taking screenshots. Just ask.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
![Status](https://img.shields.io/badge/status-experimental-orange)

Let Claude see your screen in real-time. No more "let me take a screenshot and paste it..." Just ask "what's on my screen?" and Claude sees it.

**⚠️ Experimental**: This is an experimental project using video recording. May have rough edges and requires FFmpeg installed on your system.

## Quick Start

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "vision-context": {
      "command": "npx",
      "args": ["-y", "vision-context-mcp"]
    }
  }
}
```

Restart Claude Desktop. Done.

## How to Use

Just ask naturally:

- **"What's on my screen?"** - See what's currently visible
- **"What does this error say?"** - Read error messages
- **"Show me the last 30 seconds"** - Review what just happened
- **"I'm gonna reproduce the bug now"** - Record a specific sequence

Auto-detects dev tools (Simulator, Godot, Unity, DevTools).

## Real Examples

### 🎮 Game Dev

```
"The jump animation looks off in Godot"
"Show me the last 10 seconds when the particle glitch happened"
"I'm gonna trigger the collision bug now"
```

### 📱 App Dev

```
"Check the iOS Simulator, the button is misaligned"
"What happened when the app crashed?"
"Recording the signup flow bug"
```

### 🐛 Debugging

```
"This terminal error doesn't make sense, what is it?"
"The DevTools console shows something weird"
"Help me understand this stack trace"
```

### 🎨 Design

```
"Does this match the Figma design?"
"The hover state looks wrong, can you see it?"
"Show me the last few frames of this animation"
```

### 🔬 Testing

```
"Monitor the test runner for failures"
"What happened during the failed test?"
"Recording this edge case for the bug report"
```

## Configuration (Optional)

### Customize window priorities

```json
{
  "mcpServers": {
    "vision-context": {
      "command": "npx",
      "args": ["-y", "vision-context-mcp"],
      "env": {
        "VISION_CONTEXT_WINDOW_PRIORITIES": "vscode,terminal,chrome,figma"
      }
    }
  }
}
```

### Common settings

```json
"env": {
  "VISION_CONTEXT_TARGET_WINDOW": "Simulator",        // Always monitor this window
  "VISION_CONTEXT_BUFFER_DURATION": "120",            // Keep last 2 minutes (default: 60s)
  "VISION_CONTEXT_AUTO_FOCUS_WINDOW": "true",         // Auto-focus window before capture (default: false)
  "VISION_CONTEXT_FRAME_MAX_WIDTH": "1280",           // Max frame width for LLM (default: 1280)
  "VISION_CONTEXT_FRAME_QUALITY": "85"                // JPEG quality 1-100 (default: 85)
}
```

### Presets by use case

**Web Developer:**

```json
"VISION_CONTEXT_WINDOW_PRIORITIES": "chrome,firefox,safari,vscode"
```

**Game Developer:**

```json
"VISION_CONTEXT_WINDOW_PRIORITIES": "godot,unity,unreal,blender"
```

**Mobile Developer:**

```json
"VISION_CONTEXT_TARGET_WINDOW": "Simulator"
```

## How It Works

```
Your Screen → Video Recording → Frame Extraction → Optimization → Claude Desktop
          ↳ 100% local, no cloud calls
```

**Video-Based Approach:**

- **Blackbox Mode**: Always recording last 60 seconds (like a car dashcam)
- **Original Quality**: Videos stored at source quality
- **Smart Processing**: Extracts and compresses only when needed
- **Token Optimization**: Deduplicates frames, adjusts quality for LLM efficiency

**Key Features:**

- Cross-platform (Windows, macOS, Linux) via FFmpeg
- Auto-detects dev tools (Simulator, Godot, Unity, etc.)
- Optional auto-focus for background windows
- Local AI analysis (privacy-first)

## Prerequisites

**FFmpeg Required**: This tool uses FFmpeg for video recording. Install it first:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

## Development

```bash
git clone https://github.com/yourusername/vision-context-mcp.git
cd vision-context-mcp
bun install
bun run build
```

## Known Issues

- Requires FFmpeg to be installed and in PATH
- Video recording may be resource-intensive on high-DPI displays
- First-time AI model download can take several minutes
- Some windows may not be capturable when hidden/minimized

## License

MIT

---

**No more screenshot hell. Just ask what's on your screen.**
