# Vision Context MCP 👁️✨

> **A local-first MCP server that gives your AI assistant eyes to see and understand your screen in real-time.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**Vision Context MCP** enables Claude and other LLM assistants to see and understand what's happening on your screen. It automatically monitors development windows (iOS Simulator, Godot, Android Emulator, etc.), maintains a rolling recording buffer, and provides semantic summaries of visual changes—all processed locally on your machine.

## ✨ Key Features

### 🎯 **Smart Window Detection**
Automatically finds and focuses on common development tools:
- iOS Simulator & Android Emulator
- Game Engines (Godot, Unity, Unreal, Blender)
- Browser DevTools (Chrome, Firefox)
- Or specify any window manually

### 📸 **Instant Screen Capture**
```
You: "What's on my screen right now?"
Claude: *captures and analyzes your screen automatically*
```
- Auto-detect target windows or specify manually
- Returns both image and AI-generated semantic summary
- Perfect for debugging visual issues

### 📹 **Continuous Recording Buffer**
```
You: "What just happened? Show me the last 30 seconds"
Claude: *retrieves frames from rolling buffer*
```
- Always maintains the last 60 seconds of activity
- Retrieve any timeframe from recent history
- Zero configuration—it's always recording

### 🔴 **Reproduce Mode**
```
You: "I'm about to reproduce the bug, start recording"
Claude: *starts focused recording*
You: *performs actions*
You: "Done!"
Claude: *shows complete sequence with analysis*
```
- Intentional recording for known reproduction steps
- Captures everything from start to finish
- Auto-timeout prevents forgotten recordings
- Ideal when you know you're about to trigger an issue

### 🧠 **Local AI Analysis**
- All processing on your machine (privacy-first)
- Semantic summaries using local vision models
- Automatic change detection
- No cloud dependencies

## 🚀 Quick Start

### Installation

**Option 1: NPX (No Installation)**
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

**Option 2: Global Install**
```bash
npm install -g vision-context-mcp
```

Then add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "vision-context": {
      "command": "vision-context-mcp"
    }
  }
}
```

**Option 3: With Custom Configuration**

Customize window priorities and other settings using environment variables:

```json
{
  "mcpServers": {
    "vision-context": {
      "command": "vision-context-mcp",
      "env": {
        "VISION_CONTEXT_WINDOW_PRIORITIES": "vscode,terminal,chrome,figma",
        "VISION_CONTEXT_INTERVAL": "3000",
        "VISION_CONTEXT_CHANGE_THRESHOLD": "0.03"
      }
    }
  }
}
```

**Available Environment Variables:**
- `VISION_CONTEXT_WINDOW_PRIORITIES`: Comma-separated window patterns (default: simulator,emulator,godot,unity,unreal,blender,chrome.*devtools,firefox.*developer)
- `VISION_CONTEXT_TARGET_WINDOW`: Specific window to monitor (e.g., "Simulator", "Godot")
- `VISION_CONTEXT_INTERVAL`: Monitoring interval in ms (default: 2000)
- `VISION_CONTEXT_BUFFER_DURATION`: Recording buffer duration in seconds (default: 60, max: 300)
- `VISION_CONTEXT_DIFF_THRESHOLD`: Pixel diff threshold (default: 0.1)
- `VISION_CONTEXT_CHANGE_THRESHOLD`: Min change ratio to trigger analysis (default: 0.05)
- `VISION_CONTEXT_MODEL`: Vision model name (default: Xenova/vit-gpt2-image-captioning)

Restart Claude Desktop and you're ready!

## 📖 Usage Examples

### 1. Check Current Screen
```
You: "What's on my screen?"
You: "Check the iOS Simulator"
You: "Why does this layout look wrong?"
```
→ Uses `check_screen` tool to capture and analyze

### 2. View Recent Activity
```
You: "What happened in the last 30 seconds?"
You: "Show me what just changed"
```
→ Uses `show_recent_recording` to retrieve recent frames

### 3. Reproduce an Issue (Planned Action)
```
You: "I'm going to reproduce the crash now"
Claude: 🔴 Recording started! Reproduce the issue and let me know when done.
You: *performs reproduction steps*
You: "That's it, that was the crash"
Claude: ⏹️ Got it! Here's what I captured... [analyzes sequence]
```
→ Uses `start_reproduce_mode` + `stop_reproduce_mode`

**Key Difference from Recent Recording:**
- **Reproduce Mode**: Use when you KNOW you're about to trigger something ("I'm going to click this button that crashes the app")
- **Recent Recording**: Use when something ALREADY happened ("What just crashed?")

## 🛠️ Available Tools

### `check_screen`
**Instant screenshot with AI analysis**

```typescript
Parameters:
  windowTitle?: string  // Optional: auto-detects if not provided
```

Use when:
- You want to know what's currently visible
- Debugging layout issues
- Checking error messages

---

### `show_recent_recording`
**Retrieve frames from continuous buffer**

```typescript
Parameters:
  durationSeconds?: number  // default: 30, max: depends on VISION_CONTEXT_BUFFER_DURATION
  includeAnalysis?: boolean // default: false
```

Use when:
- Something unexpected just happened
- You need to see recent changes
- Investigating "what just occurred"

**Why this exists:** The system is always recording (default: last 60 seconds), so you can always look back at recent activity without planning ahead.

---

### `start_reproduce_mode`
**Start focused recording for known reproduction**

```typescript
Parameters:
  timeoutMinutes?: number  // default: 2, max: 5
```

Use when:
- You're about to reproduce a known issue
- You want to capture a specific sequence
- You need start/stop control over recording

**Auto-timeout:** Prevents infinite recording if you forget to stop it.

---

### `stop_reproduce_mode`
**Stop reproduce mode and analyze captured sequence**

```typescript
Parameters:
  analyzeChanges?: boolean  // default: true
```

## 🎯 Real-World Scenarios

### Scenario 1: Layout Debugging
```
You: "The iOS app layout looks broken"
Claude: *check_screen captures Simulator*
Claude: "I can see the issue—the username label is overlapping
        with the profile image. This appears to be caused by..."
```

### Scenario 2: Error Investigation
```
You: "There's an error but I don't understand it"
Claude: *check_screen*
Claude: "The error message indicates a null pointer exception
        at line 42 in UserService.swift..."
```

### Scenario 3: Tracking Intermittent Bugs
```
You: *working in app*
You: "Wait, something weird just happened!"
Claude: *show_recent_recording(45)*
Claude: "Looking at the last 45 seconds, the glitch occurred
        when you clicked the refresh button while the previous
        request was still loading..."
```

### Scenario 4: Reproducing Issues
```
You: "I found the steps to reproduce the crash. Ready to record?"
Claude: *start_reproduce_mode*
Claude: "🔴 Recording! Show me the steps."
You: "1. Open settings, 2. Toggle dark mode, 3. Go back"
You: "There! It crashed. Did you get it?"
Claude: *stop_reproduce_mode*
Claude: "⏹️ Yes! Analyzing the 8 captured frames...
        The crash happens exactly when returning from settings
        with dark mode toggled. The issue appears to be..."
```

## 🏗️ Architecture

### Privacy-First Design
```
┌─────────────┐
│ Your Screen │
└──────┬──────┘
       │ (local capture)
       ▼
┌─────────────────┐
│ Vision Model    │ ← Runs on YOUR machine
│ (Transformers)  │ ← No cloud calls
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Claude Desktop  │ ← Receives summaries only
└─────────────────┘
```

### Resource Management
- **Rolling Buffer**: Configurable duration (default: 60 seconds, max: 5 minutes)
- **Smart Sampling**: Shows key frames, not every frame
- **Efficient Memory**: Old frames automatically discarded
- **Configurable Timeouts**: Prevents runaway recording

### Detection Priority
1. Development Tools (Simulator, Emulator)
2. Game Engines (Godot, Unity, Unreal)
3. Browser DevTools
4. Full screen (fallback)

## 🔒 Privacy & Security

✅ **100% Local Processing** - All AI runs on your machine
✅ **Zero Cloud Calls** - No external API dependencies
✅ **No Telemetry** - Zero data collection
✅ **User Control** - You decide what's captured and when
✅ **Open Source** - Full transparency

## ⚙️ Configuration

### Environment Variables

All settings can be customized via environment variables in your Claude Desktop config:

```json
{
  "mcpServers": {
    "vision-context": {
      "command": "vision-context-mcp",
      "env": {
        "VISION_CONTEXT_WINDOW_PRIORITIES": "vscode,terminal,chrome,figma,notion",
        "VISION_CONTEXT_INTERVAL": "3000",
        "VISION_CONTEXT_CHANGE_THRESHOLD": "0.03",
        "VISION_CONTEXT_MODEL": "Xenova/vit-gpt2-image-captioning"
      }
    }
  }
}
```

**Core Settings:**
- `VISION_CONTEXT_WINDOW_PRIORITIES`: Window detection priority (comma-separated)
  - Default: `simulator,emulator,godot,unity,unreal,blender,chrome.*devtools,firefox.*developer`
  - Examples: `vscode,terminal,chrome`, `figma,sketch,photoshop`, `slack,discord,teams`
  - Supports regex patterns (e.g., `chrome.*devtools`)

- `VISION_CONTEXT_TARGET_WINDOW`: Specific window to always monitor
  - Default: `null` (auto-detect or full screen)
  - Example: `"Simulator"`, `"Godot"`, `"Unity"`
  - Supports partial matching (e.g., `"Sim"` matches "Simulator")

- `VISION_CONTEXT_INTERVAL`: Monitoring interval in milliseconds
  - Default: `2000` (2 seconds)
  - Range: 1000-10000 recommended
  - Lower = more responsive, higher = less CPU usage

- `VISION_CONTEXT_BUFFER_DURATION`: Recording buffer duration in seconds
  - Default: `60` (1 minute)
  - Range: 10-300 recommended (max: 5 minutes)
  - How long to keep frames in the rolling buffer for `show_recent_recording`

- `VISION_CONTEXT_DIFF_THRESHOLD`: Pixel difference threshold
  - Default: `0.1`
  - Range: 0.0-1.0
  - Lower = more sensitive to small changes

- `VISION_CONTEXT_CHANGE_THRESHOLD`: Minimum change ratio to trigger analysis
  - Default: `0.05` (5% of pixels changed)
  - Range: 0.0-1.0
  - Lower = analyzes more often

- `VISION_CONTEXT_MODEL`: Vision model name
  - Default: `Xenova/vit-gpt2-image-captioning`
  - Other options: Check [Transformers.js models](https://huggingface.co/models?library=transformers.js)

**Model Cache Settings:**
```bash
export TRANSFORMERS_CACHE=/path/to/cache  # Model cache location
export TRANSFORMERS_OFFLINE=1             # Disable auto-download
```

### Example Configurations

**Web Developer:**
```json
"env": {
  "VISION_CONTEXT_WINDOW_PRIORITIES": "chrome,firefox,safari,vscode",
  "VISION_CONTEXT_INTERVAL": "1500"
}
```

**Game Developer:**
```json
"env": {
  "VISION_CONTEXT_WINDOW_PRIORITIES": "godot,unity,unreal,blender",
  "VISION_CONTEXT_CHANGE_THRESHOLD": "0.02"
}
```

**Mobile Developer:**
```json
"env": {
  "VISION_CONTEXT_WINDOW_PRIORITIES": "simulator,emulator,xcode,android studio"
}
```

**Designer:**
```json
"env": {
  "VISION_CONTEXT_WINDOW_PRIORITIES": "figma,sketch,photoshop,illustrator"
}
```

## 🔧 Development

### Build from Source
```bash
git clone https://github.com/yourusername/vision-context-mcp.git
cd vision-context-mcp
npm install
npm run build
```

### Development Mode
```bash
npm run dev
```

### Project Structure
```
vision-context-mcp/
├── src/
│   ├── index.ts           # Main MCP server
│   └── env-setup.ts       # Environment configuration
├── dist/                  # Built output
├── package.json
└── README.md
```

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a Pull Request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation
- Ensure builds pass

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io)
- Vision AI via [Transformers.js](https://github.com/xenova/transformers.js)
- Window management via [node-window-manager](https://github.com/sentialx/node-window-manager)
- Screenshot capture via [screenshot-desktop](https://github.com/bencevans/screenshot-desktop)

## 🐛 Known Limitations

- **Platform**: macOS only (Windows/Linux support planned)
- **Vision Model**: Basic captioning (better models coming)
- **Performance**: Resource-intensive on high-DPI/Retina displays
- **Window Detection**: May not detect all custom application windows

## 🗺️ Roadmap

- [ ] Windows & Linux support
- [ ] Better vision models (LLaVA, CLIP)
- [ ] OCR for text extraction
- [ ] Video export functionality
- [ ] Custom window filter patterns
- [ ] Configurable buffer duration
- [ ] Multi-monitor support
- [ ] Selective region capture

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/vision-context-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/vision-context-mcp/discussions)
- **MCP Documentation**: [Model Context Protocol](https://modelcontextprotocol.io)

## 📊 Comparison

| Feature | Vision Context MCP | Screen Recording | Cloud Vision APIs |
|---------|-------------------|------------------|-------------------|
| Privacy | ✅ 100% Local | ⚠️ Local files | ❌ Cloud upload |
| Real-time | ✅ Yes | ❌ Post-process | ⚠️ Latency |
| AI Analysis | ✅ Automatic | ❌ Manual review | ✅ Automatic |
| Cost | ✅ Free | ✅ Free | ❌ Pay per call |
| Setup | ✅ One command | ⚠️ Multiple tools | ⚠️ API keys |

---

**Built with ❤️ for developers who want their AI assistant to truly see what they're working on.**

**Perfect for:** Game development, mobile app testing, UI/UX debugging, live coding sessions, and any workflow where visual context matters.
