#!/usr/bin/env node
/**
 * MCP Screen Observer
 * * A local-first MCP server that monitors screen activity and provides semantic summaries to LLMs.
 */

// 환경 설정을 가장 먼저 import
import "./env-setup.js";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import screenshot from "screenshot-desktop";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import sharp from "sharp";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { windowManager } from "node-window-manager";

// --- Dynamic Import for AI Library ---
// 설정을 적용한 후 라이브러리를 불러옵니다.
const { pipeline, env, RawImage } = await import("@xenova/transformers");

// --- Configuration ---
env.useBrowserCache = false;
env.allowLocalModels = true;
env.backends.onnx.wasm.proxy = false;

const CONFIG = {
  CHECK_INTERVAL_MS: parseInt(process.env.VISION_CONTEXT_INTERVAL || "2000"),
  DIFF_THRESHOLD: parseFloat(process.env.VISION_CONTEXT_DIFF_THRESHOLD || "0.1"),
  CHANGE_TRIGGER_PERCENT: parseFloat(process.env.VISION_CONTEXT_CHANGE_THRESHOLD || "0.05"),
  MODEL_NAME: process.env.VISION_CONTEXT_MODEL || "Xenova/vit-gpt2-image-captioning",
  BUFFER_DURATION_SECONDS: parseInt(process.env.VISION_CONTEXT_BUFFER_DURATION || "60")
};

// Default window priorities (can be overridden via env var)
const DEFAULT_WINDOW_PRIORITIES = [
  "simulator",      // iOS Simulator
  "emulator",       // Android Emulator
  "godot",          // Godot Engine
  "unity",          // Unity Editor
  "unreal",         // Unreal Engine
  "blender",        // Blender
  "chrome.*devtools", // Chrome DevTools
  "firefox.*developer", // Firefox Developer
];

// Parse custom window priorities from environment variable
// Format: VISION_CONTEXT_WINDOW_PRIORITIES="vscode,terminal,chrome"
const WINDOW_PRIORITIES = process.env.VISION_CONTEXT_WINDOW_PRIORITIES
  ? process.env.VISION_CONTEXT_WINDOW_PRIORITIES.split(",").map(p => p.trim())
  : DEFAULT_WINDOW_PRIORITIES;

// Optional: Target specific window by title (partial match supported)
// Format: VISION_CONTEXT_TARGET_WINDOW="Simulator"
const TARGET_WINDOW_TITLE = process.env.VISION_CONTEXT_TARGET_WINDOW || null;

// --- Helper Functions ---

// Smart window detection - prioritizes based on configured patterns
function findMostLikelyTargetWindow() {
  const windows = windowManager.getWindows();

  // Convert string patterns to RegExp (case-insensitive)
  const patterns = WINDOW_PRIORITIES.map(p => new RegExp(p, 'i'));

  for (const pattern of patterns) {
    const window = windows.find(w => pattern.test(w.getTitle()));
    if (window) return window;
  }

  return null;
}

// Helper function to find window by title (supports partial matching)
function findWindowByTitle(searchTitle: string) {
  const windows = windowManager.getWindows();
  const search = searchTitle.toLowerCase().trim();

  // Priority 1: Exact match
  let window = windows.find(w => w.getTitle().toLowerCase() === search);
  if (window) return window;

  // Priority 2: Starts with (more precise than contains)
  window = windows.find(w => w.getTitle().toLowerCase().startsWith(search));
  if (window) return window;

  // Priority 3: Contains (most flexible)
  window = windows.find(w => w.getTitle().toLowerCase().includes(search));
  return window;
}

// Helper function to get available windows list (for error messages)
function getAvailableWindowsList(): string {
  const windows = windowManager.getWindows()
    .filter(w => w.getTitle() && w.getTitle().trim() !== "")
    .slice(0, 20); // Limit to 20 windows to avoid overwhelming

  if (windows.length === 0) {
    return "No windows currently available.";
  }

  return windows
    .map((w, i) => `  ${i + 1}. "${w.getTitle()}"`)
    .join('\n');
}

// --- State Management ---

interface ScreenContext {
  timestamp: number;
  summary: string;
  diffScore: number;
  status: "initializing" | "active" | "error";
  targetWindow?: string;
}

interface RecordingFrame {
  timestamp: number;
  buffer: Buffer;
  summary?: string;
}

let globalContext: ScreenContext = {
  timestamp: Date.now(),
  summary: "System initializing... waiting for first screen analysis.",
  diffScore: 0,
  status: "initializing"
};

let previousImgBuffer: Buffer | null = null;
let targetWindowId: number | null = null;

// Recording state
let recordingBuffer: RecordingFrame[] = [];
let isReproduceMode = false;
let reproduceModeTimeout: NodeJS.Timeout | null = null;
const MAX_RECORDING_DURATION_MS = CONFIG.BUFFER_DURATION_SECONDS * 1000;

// --- AI Model Initialization ---

console.error("[System] Loading Local Vision Model...");
const captioner = await pipeline("image-to-text", CONFIG.MODEL_NAME);
console.error("[System] Vision Model Loaded.");

// Initialize target window if specified
if (TARGET_WINDOW_TITLE) {
  const targetWindow = findWindowByTitle(TARGET_WINDOW_TITLE);
  if (targetWindow) {
    targetWindowId = targetWindow.id;
    globalContext.targetWindow = targetWindow.getTitle();
    console.error(`[System] Target window set: ${targetWindow.getTitle()}`);
  } else {
    console.error(`[Warning] Target window "${TARGET_WINDOW_TITLE}" not found. Using full screen.`);
  }
}

console.error("[System] Monitoring started.");


// --- Core Logic: Monitoring Loop ---

async function startMonitoringLoop() {
  setInterval(async () => {
    try {
      // 1. Capture Screenshot (targeted window if set)
      let imgBuff: Buffer;

      if (targetWindowId !== null) {
        const window = windowManager.getWindows().find(w => w.id === targetWindowId);
        if (!window) {
          console.error("[Warning] Target window not found, falling back to full screen");
          imgBuff = await screenshot({ format: "png" });
        } else {
          // Capture full screen then crop to window bounds
          const fullScreen = await screenshot({ format: "png" });
          const bounds = window.getBounds();

          // Validate bounds before cropping
          if (bounds.x === undefined || bounds.y === undefined ||
              bounds.width === undefined || bounds.height === undefined) {
            console.error("[Warning] Invalid window bounds, falling back to full screen");
            imgBuff = fullScreen;
          } else {
            // Crop the image to window bounds
            imgBuff = await sharp(fullScreen)
              .extract({
                left: Math.max(0, bounds.x),
                top: Math.max(0, bounds.y),
                width: bounds.width,
                height: bounds.height
              })
              .png()
              .toBuffer();
          }
        }
      } else {
        imgBuff = await screenshot({ format: "png" });
      }

      // Add to rolling recording buffer
      const now = Date.now();
      recordingBuffer.push({ timestamp: now, buffer: imgBuff });

      // Keep only last 1 minute (or MAX_RECORDING_DURATION_MS)
      recordingBuffer = recordingBuffer.filter(
        frame => now - frame.timestamp < MAX_RECORDING_DURATION_MS
      );

      if (!previousImgBuffer) {
        previousImgBuffer = imgBuff;
        return;
      }

      // 2. Prepare for comparison
      const img1 = PNG.sync.read(previousImgBuffer);
      const img2 = PNG.sync.read(imgBuff);
      const { width, height } = img1;

      if (img2.width !== width || img2.height !== height) {
        previousImgBuffer = imgBuff;
        return;
      }

      // 3. Detect Visual Changes
      const diff = new PNG({ width, height });
      const numDiffPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        width,
        height,
        { threshold: CONFIG.DIFF_THRESHOLD }
      );

      const changeRatio = numDiffPixels / (width * height);

      // 4. AI Analysis
      if (changeRatio > CONFIG.CHANGE_TRIGGER_PERCENT) {

        // 임시 파일로 저장 후 RawImage로 읽기
        const tempPath = join(tmpdir(), `screen-${Date.now()}.png`);
        try {
          writeFileSync(tempPath, imgBuff);
          const image = await RawImage.read(tempPath);

          const output = await captioner(image) as any;

          const generatedText = output[0]?.generated_text || "No summary generated";

          globalContext = {
            timestamp: Date.now(),
            summary: generatedText,
            diffScore: changeRatio,
            status: "active",
            targetWindow: globalContext.targetWindow
          };

          console.error(`[Update] Change: ${(changeRatio * 100).toFixed(1)}% | Summary: "${generatedText}"`);
        } finally {
          // 임시 파일 삭제
          try {
            unlinkSync(tempPath);
          } catch (e) {
            // 파일 삭제 실패는 무시
          }
        }
      }

      previousImgBuffer = imgBuff;

    } catch (error) {
      console.error("[Error] Screen monitoring failed:", error);
    }
  }, CONFIG.CHECK_INTERVAL_MS);
}

// --- MCP Server Implementation ---

const server = new Server(
  {
    name: "context-capture-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// --- Resources Handler: Available Windows ---
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const windows = windowManager.getWindows();
  const windowResources = windows
    .filter(w => w.getTitle() && w.getTitle().trim() !== "")
    .map(w => ({
      uri: `window:///${w.id}`,
      name: w.getTitle(),
      description: `${w.path.split('/').pop()} - ${w.getBounds().width}x${w.getBounds().height}`,
      mimeType: "application/json"
    }));

  return {
    resources: [
      {
        uri: "screen:///current",
        name: "Current Screen Context",
        description: "Semantic summary of current screen activity",
        mimeType: "text/plain"
      },
      ...windowResources
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === "screen:///current") {
    const timeAgo = Math.floor((Date.now() - globalContext.timestamp) / 1000);
    const targetInfo = globalContext.targetWindow ? `\nTarget Window: ${globalContext.targetWindow}` : "";

    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `Status: ${globalContext.status}\n` +
                `Last Update: ${timeAgo} seconds ago\n` +
                `Visual Summary: ${globalContext.summary}\n` +
                `Change Intensity: ${(globalContext.diffScore * 100).toFixed(1)}%` +
                targetInfo
        }
      ]
    };
  }

  if (uri.startsWith("window:///")) {
    const windowId = parseInt(uri.replace("window:///", ""));
    const window = windowManager.getWindows().find(w => w.id === windowId);

    if (!window) {
      throw new Error(`Window ${windowId} not found`);
    }

    const bounds = window.getBounds();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            id: window.id,
            title: window.getTitle(),
            process: window.path.split('/').pop(),
            bounds: {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height
            }
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "check_screen",
        description: "Take an instant screenshot and analyze what's currently visible. Automatically detects common development windows (Simulator, Godot, Emulator, etc.) or you can specify a window. Perfect for 'what's on the screen right now?' type questions.",
        inputSchema: {
          type: "object",
          properties: {
            windowTitle: {
              type: "string",
              description: "Optional: Specific window to check. If not provided, automatically finds the most likely target (Simulator, Emulator, Godot, etc.) or uses full screen."
            }
          }
        },
      },
      {
        name: "show_recent_recording",
        description: "Get frames from the last N seconds of screen activity. The system continuously records in a rolling buffer, so you can see what happened recently. Useful for 'what just happened?' or 'show me the last 30 seconds' questions.",
        inputSchema: {
          type: "object",
          properties: {
            durationSeconds: {
              type: "number",
              description: `How many seconds back to retrieve (default: 30, max: ${CONFIG.BUFFER_DURATION_SECONDS})`,
              default: 30
            },
            includeAnalysis: {
              type: "boolean",
              description: "Whether to include AI analysis of changes (default: false for speed)",
              default: false
            }
          }
        },
      },
      {
        name: "start_reproduce_mode",
        description: "Start recording mode for reproducing an issue. Tell the user to reproduce the problem, then captures everything until 'stop_reproduce_mode' is called. Has a 2-minute timeout for safety.",
        inputSchema: {
          type: "object",
          properties: {
            timeoutMinutes: {
              type: "number",
              description: "Maximum recording time in minutes (default: 2, max: 5)",
              default: 2
            }
          }
        },
      },
      {
        name: "stop_reproduce_mode",
        description: "Stop reproduce mode and get all captured frames with analysis. Use this after the user has reproduced the issue.",
        inputSchema: {
          type: "object",
          properties: {
            analyzeChanges: {
              type: "boolean",
              description: "Whether to analyze what changed (default: true)",
              default: true
            }
          }
        },
      },
    ],
  };
});

// Helper function to capture and analyze window screenshot
async function captureAndAnalyzeWindow(windowId?: number) {
  let imgBuff: Buffer;
  let windowName = "Full Screen";

  if (windowId) {
    const window = windowManager.getWindows().find(w => w.id === windowId);
    if (!window) {
      throw new Error("Window not found");
    }

    const fullScreen = await screenshot({ format: "png" });
    const bounds = window.getBounds();

    if (bounds.x !== undefined && bounds.y !== undefined &&
        bounds.width !== undefined && bounds.height !== undefined) {
      imgBuff = await sharp(fullScreen)
        .extract({
          left: Math.max(0, bounds.x),
          top: Math.max(0, bounds.y),
          width: bounds.width,
          height: bounds.height
        })
        .png()
        .toBuffer();
      windowName = window.getTitle();
    } else {
      imgBuff = fullScreen;
    }
  } else {
    imgBuff = await screenshot({ format: "png" });
  }

  // Analyze with AI
  const tempPath = join(tmpdir(), `screen-instant-${Date.now()}.png`);
  try {
    writeFileSync(tempPath, imgBuff);
    const image = await RawImage.read(tempPath);
    const output = await captioner(image) as any;
    const summary = output[0]?.generated_text || "No summary generated";

    return { summary, windowName, screenshot: imgBuff };
  } finally {
    try {
      unlinkSync(tempPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // check_screen - instant screenshot with smart detection
  if (request.params.name === "check_screen") {
    const windowTitle = request.params.arguments?.windowTitle as string | undefined;

    let windowId: number | undefined;
    let detectedWindow: string | undefined;

    if (windowTitle) {
      const window = findWindowByTitle(windowTitle);
      if (!window) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Window "${windowTitle}" not found.\n\n` +
                    `📋 Available windows:\n${getAvailableWindowsList()}\n\n` +
                    `💡 Tip: You can use partial names (e.g., "Sim" for "iOS Simulator")`
            }
          ]
        };
      }
      windowId = window.id;
      detectedWindow = window.getTitle();
    } else {
      // Auto-detect most likely target
      const autoWindow = findMostLikelyTargetWindow();
      if (autoWindow) {
        windowId = autoWindow.id;
        detectedWindow = autoWindow.getTitle();
      }
    }

    const result = await captureAndAnalyzeWindow(windowId);

    return {
      content: [
        {
          type: "text",
          text: `📸 Screen Check (${result.windowName})${detectedWindow && !windowTitle ? ' - Auto-detected' : ''}\n\n` +
                `${result.summary}\n\n` +
                `Now you can ask detailed questions about what you see.`
        },
        {
          type: "image",
          data: result.screenshot.toString('base64'),
          mimeType: "image/png"
        }
      ]
    };
  }

  // show_recent_recording - get last N seconds
  if (request.params.name === "show_recent_recording") {
    const durationSeconds = Math.min((request.params.arguments?.durationSeconds as number) || 30, CONFIG.BUFFER_DURATION_SECONDS);

    const cutoffTime = Date.now() - (durationSeconds * 1000);
    const recentFrames = recordingBuffer.filter(f => f.timestamp >= cutoffTime);

    if (recentFrames.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No recordings available for the requested duration. The system may have just started."
          }
        ]
      };
    }

    // Sample frames (max 5) to avoid overwhelming
    const sampleInterval = Math.max(1, Math.floor(recentFrames.length / 5));
    const sampledFrames = recentFrames.filter((_, i) => i % sampleInterval === 0).slice(0, 5);

    const content: any[] = [
      {
        type: "text",
        text: `📹 Last ${durationSeconds} seconds (${recentFrames.length} frames, showing ${sampledFrames.length} key frames)\n\n` +
              `Time range: ${new Date(recentFrames[0]!.timestamp).toLocaleTimeString()} - ${new Date(recentFrames[recentFrames.length - 1]!.timestamp).toLocaleTimeString()}`
      }
    ];

    for (const frame of sampledFrames) {
      const timeAgo = Math.round((Date.now() - frame.timestamp) / 1000);
      content.push({
        type: "text",
        text: `\n⏱️  ${timeAgo}s ago`
      });
      content.push({
        type: "image",
        data: frame.buffer.toString('base64'),
        mimeType: "image/png"
      });
    }

    return { content };
  }

  // start_reproduce_mode
  if (request.params.name === "start_reproduce_mode") {
    const timeoutMinutes = Math.min((request.params.arguments?.timeoutMinutes as number) || 2, 5);

    if (isReproduceMode) {
      return {
        content: [
          {
            type: "text",
            text: "⚠️ Reproduce mode is already active. Call stop_reproduce_mode first."
          }
        ]
      };
    }

    isReproduceMode = true;
    recordingBuffer = []; // Clear buffer and start fresh

    // Set timeout
    if (reproduceModeTimeout) clearTimeout(reproduceModeTimeout);
    reproduceModeTimeout = setTimeout(() => {
      isReproduceMode = false;
      console.error("[System] Reproduce mode timed out");
    }, timeoutMinutes * 60 * 1000);

    return {
      content: [
        {
          type: "text",
          text: `🔴 Recording started!\n\n` +
                `Please reproduce the issue now. I'm capturing everything.\n` +
                `Call 'stop_reproduce_mode' when done (auto-stops in ${timeoutMinutes} minutes).`
        }
      ]
    };
  }

  // stop_reproduce_mode
  if (request.params.name === "stop_reproduce_mode") {
    if (!isReproduceMode) {
      return {
        content: [
          {
            type: "text",
            text: "⚠️ Reproduce mode is not active. Call start_reproduce_mode first."
          }
        ]
      };
    }

    isReproduceMode = false;
    if (reproduceModeTimeout) {
      clearTimeout(reproduceModeTimeout);
      reproduceModeTimeout = null;
    }

    if (recordingBuffer.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No frames were captured during reproduce mode."
          }
        ]
      };
    }

    // Sample frames (max 8 for reproduce mode)
    const sampleInterval = Math.max(1, Math.floor(recordingBuffer.length / 8));
    const sampledFrames = recordingBuffer.filter((_, i) => i % sampleInterval === 0).slice(0, 8);

    const totalDuration = Math.round((recordingBuffer[recordingBuffer.length - 1]!.timestamp - recordingBuffer[0]!.timestamp) / 1000);

    const content: any[] = [
      {
        type: "text",
        text: `⏹️ Recording stopped!\n\n` +
              `Captured ${recordingBuffer.length} frames over ${totalDuration} seconds.\n` +
              `Showing ${sampledFrames.length} key frames:\n`
      }
    ];

    for (let i = 0; i < sampledFrames.length; i++) {
      const frame = sampledFrames[i]!;
      const secondsFromStart = Math.round((frame.timestamp - recordingBuffer[0]!.timestamp) / 1000);

      content.push({
        type: "text",
        text: `\n📍 Frame ${i + 1} (${secondsFromStart}s from start)`
      });
      content.push({
        type: "image",
        data: frame.buffer.toString('base64'),
        mimeType: "image/png"
      });
    }

    return { content };
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

// --- Main Execution ---

async function main() {
  startMonitoringLoop();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Screen Observer running on stdio...");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});