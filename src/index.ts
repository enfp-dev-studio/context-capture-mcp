#!/usr/bin/env node
/**
 * Vision Context MCP
 * A local-first MCP server that gives Claude eyes to see your screen in real-time.
 */

// Import environment configuration first
import "./env-setup.js";

// Window helper functions
import { findWindowByTitle, getAvailableWindowsList, findMostLikelyTargetWindow } from "./helpers.js";

// Video recording and frame processing
import { VideoRecorder } from "./video-recorder.js";
import { FrameProcessor } from "./frame-processor.js";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import screenshot from "screenshot-desktop";
import sharp from "sharp";
import { windowManager, Window } from "node-window-manager";

// --- Dynamic Import for AI Library ---
const { pipeline, env, RawImage } = await import("@xenova/transformers");

// --- Configuration ---
env.useBrowserCache = false;
env.allowLocalModels = true;
env.backends.onnx.wasm.proxy = false;

const CONFIG = {
  MODEL_NAME: process.env.VISION_CONTEXT_MODEL || "Xenova/vit-gpt2-image-captioning",
  BUFFER_DURATION_SECONDS: parseInt(process.env.VISION_CONTEXT_BUFFER_DURATION || "60"),
  AUTO_FOCUS_WINDOW: process.env.VISION_CONTEXT_AUTO_FOCUS_WINDOW === "true",
  FRAME_MAX_WIDTH: parseInt(process.env.VISION_CONTEXT_FRAME_MAX_WIDTH || "1280"),
  FRAME_QUALITY: parseInt(process.env.VISION_CONTEXT_FRAME_QUALITY || "85"),
};

// Window priorities
const DEFAULT_WINDOW_PRIORITIES = [
  "simulator", "emulator", "godot", "unity", "unreal", "blender",
  "chrome.*devtools", "firefox.*developer",
];

const WINDOW_PRIORITIES = process.env.VISION_CONTEXT_WINDOW_PRIORITIES
  ? process.env.VISION_CONTEXT_WINDOW_PRIORITIES.split(",").map(p => p.trim())
  : DEFAULT_WINDOW_PRIORITIES;

const TARGET_WINDOW_TITLE = process.env.VISION_CONTEXT_TARGET_WINDOW || null;

// --- State Management ---
let targetWindow: Window | null = null;

// Initialize video recorder and frame processor
const videoRecorder = new VideoRecorder(CONFIG.BUFFER_DURATION_SECONDS);
const frameProcessor = new FrameProcessor();

// --- AI Model Initialization ---
console.error("[System] Loading Local Vision Model...");
const captioner = await pipeline("image-to-text", CONFIG.MODEL_NAME);
console.error("[System] Vision Model Loaded.");

// Initialize target window if specified
if (TARGET_WINDOW_TITLE) {
  const foundWindow = findWindowByTitle(TARGET_WINDOW_TITLE, windowManager.getWindows());
  if (foundWindow) {
    targetWindow = foundWindow;
    console.error(`[System] Target window set: ${targetWindow.getTitle()}`);
  } else {
    console.error(`[Warning] Target window "${TARGET_WINDOW_TITLE}" not found.`);
  }
}

// Start blackbox recording
console.error("[System] Starting blackbox recording...");
await videoRecorder.startBlackbox({
  // Add window-specific recording options if target window is set
  // This will be platform-specific and may need adjustment
});
console.error("[System] Blackbox recording active.");

// --- Helper Functions ---

/**
 * Focus window if auto-focus is enabled
 */
async function focusWindowIfNeeded(window: Window | null): Promise<void> {
  if (CONFIG.AUTO_FOCUS_WINDOW && window) {
    try {
      window.bringToTop();
      // Wait for window to be focused and rendered
      await new Promise(resolve => setTimeout(resolve, 500));
      console.error(`[System] Focused window: ${window.getTitle()}`);
    } catch (error) {
      console.error(`[Warning] Failed to focus window:`, error);
    }
  }
}

/**
 * Capture screenshot of target window or full screen
 */
async function captureScreenshot(window?: Window): Promise<{ buffer: Buffer; windowName: string }> {
  let imgBuff: Buffer;
  let windowName = "Full Screen";

  if (window) {
    await focusWindowIfNeeded(window);

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

  return { buffer: imgBuff, windowName };
}

/**
 * Analyze image with AI model
 */
async function analyzeImage(buffer: Buffer): Promise<string> {
  // Write buffer to temp file for RawImage
  const { writeFileSync, unlinkSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const tempPath = join(tmpdir(), `analyze-${Date.now()}.jpg`);
  try {
    writeFileSync(tempPath, buffer);
    const image = await RawImage.read(tempPath);
    const output = await captioner(image) as any;
    return output[0]?.generated_text || "No summary generated";
  } finally {
    try {
      unlinkSync(tempPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// --- MCP Server Implementation ---

const server = new Server(
  {
    name: "vision-context-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// --- Resources Handler ---
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const windows = windowManager.getWindows();
  const windowResources = windows
    .filter(w => w.getTitle() && w.getTitle().trim() !== "")
    .slice(0, 50) // Limit to 50 windows
    .map(w => ({
      uri: `window:///${w.id}`,
      name: w.getTitle(),
      description: `${w.path.split('/').pop()} - ${w.getBounds().width}x${w.getBounds().height}`,
      mimeType: "application/json"
    }));

  return {
    resources: [
      {
        uri: "recorder:///status",
        name: "Recording Status",
        description: "Current recording mode and status",
        mimeType: "application/json"
      },
      ...windowResources
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === "recorder:///status") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            mode: videoRecorder.getMode(),
            isActive: videoRecorder.isActive(),
            targetWindow: targetWindow?.getTitle() || null,
          }, null, 2)
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
            bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// --- Tools Handler ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "check_screen",
        description: "Take an instant screenshot and analyze what's currently visible. Auto-detects dev windows or you can specify one.",
        inputSchema: {
          type: "object",
          properties: {
            windowTitle: {
              type: "string",
              description: "Optional: Specific window to check. Auto-detects if not provided."
            }
          }
        },
      },
      {
        name: "show_recent_recording",
        description: `Get frames from the blackbox buffer (always recording last ${CONFIG.BUFFER_DURATION_SECONDS} seconds).`,
        inputSchema: {
          type: "object",
          properties: {
            durationSeconds: {
              type: "number",
              description: `How many seconds back to retrieve (default: 30, max: ${CONFIG.BUFFER_DURATION_SECONDS})`,
              default: 30
            }
          }
        },
      },
      {
        name: "start_reproduce_mode",
        description: "Start recording for bug reproduction. Stops blackbox temporarily.",
        inputSchema: {
          type: "object",
          properties: {
            timeoutMinutes: {
              type: "number",
              description: "Maximum recording time (default: 2, max: 5)",
              default: 2
            }
          }
        },
      },
      {
        name: "stop_reproduce_mode",
        description: "Stop reproduce mode and get captured frames with analysis.",
        inputSchema: {
          type: "object",
          properties: {}
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // check_screen - instant screenshot with AI analysis
  if (request.params.name === "check_screen") {
    const windowTitle = request.params.arguments?.windowTitle as string | undefined;

    let selectedWindow: Window | undefined;
    let detectedWindow: string | undefined;

    if (windowTitle) {
      selectedWindow = findWindowByTitle(windowTitle, windowManager.getWindows());
      if (!selectedWindow) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Window "${windowTitle}" not found.\n\n` +
                    `📋 Available windows:\n${getAvailableWindowsList(windowManager.getWindows())}\n\n` +
                    `💡 Tip: You can use partial names (e.g., "Sim" for "iOS Simulator")`
            }
          ]
        };
      }
      detectedWindow = selectedWindow.getTitle();
    } else {
      // Auto-detect
      const autoWindow = findMostLikelyTargetWindow(windowManager.getWindows(), WINDOW_PRIORITIES);
      if (autoWindow) {
        selectedWindow = autoWindow;
        detectedWindow = autoWindow.getTitle();
      }
    }

    const { buffer, windowName } = await captureScreenshot(selectedWindow);

    // Optimize for LLM
    const optimized = await frameProcessor.optimizeScreenshot(buffer, {
      maxWidth: CONFIG.FRAME_MAX_WIDTH,
      quality: CONFIG.FRAME_QUALITY,
    });

    const summary = await analyzeImage(optimized);

    return {
      content: [
        {
          type: "text",
          text: `📸 Screen Check (${windowName})${detectedWindow && !windowTitle ? ' - Auto-detected' : ''}\n\n` +
                `${summary}\n\n` +
                `Now you can ask detailed questions about what you see.`
        },
        {
          type: "image",
          data: optimized.toString('base64'),
          mimeType: "image/jpeg"
        }
      ]
    };
  }

  // show_recent_recording - get frames from blackbox buffer
  if (request.params.name === "show_recent_recording") {
    const durationSeconds = Math.min(
      (request.params.arguments?.durationSeconds as number) || 30,
      CONFIG.BUFFER_DURATION_SECONDS
    );

    const segments = videoRecorder.getRecentSegments(durationSeconds);

    if (segments.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No recordings available for the requested duration. The system may have just started."
          }
        ]
      };
    }

    // Extract and process frames from video segments
    const content: any[] = [
      {
        type: "text",
        text: `📹 Last ${durationSeconds} seconds (${segments.length} video segments)\n\n` +
              `Extracting and analyzing key frames...`
      }
    ];

    for (const segment of segments) {
      try {
        const frames = await frameProcessor.extractFrames(segment.filePath, {
          maxFrames: 3, // 3 frames per segment
          maxWidth: CONFIG.FRAME_MAX_WIDTH,
          quality: CONFIG.FRAME_QUALITY,
          skipSimilar: true,
        });

        for (const frame of frames) {
          const timeAgo = Math.round((Date.now() - frame.timestamp) / 1000);
          content.push({
            type: "text",
            text: `\n⏱️  ~${timeAgo}s ago`
          });
          content.push({
            type: "image",
            data: frame.buffer.toString('base64'),
            mimeType: "image/jpeg"
          });
        }
      } catch (error) {
        console.error(`[Error] Failed to process segment: ${segment.filePath}`, error);
      }
    }

    return { content };
  }

  // start_reproduce_mode
  if (request.params.name === "start_reproduce_mode") {
    const timeoutMinutes = Math.min((request.params.arguments?.timeoutMinutes as number) || 2, 5);

    try {
      await videoRecorder.startReproduce({
        fps: 30,
        duration: timeoutMinutes * 60,
      });

      return {
        content: [
          {
            type: "text",
            text: `🔴 Recording started!\n\n` +
                  `Reproduce the issue now. I'm capturing everything.\n` +
                  `Call 'stop_reproduce_mode' when done (auto-stops in ${timeoutMinutes} minutes).`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ ${error.message}`
          }
        ]
      };
    }
  }

  // stop_reproduce_mode
  if (request.params.name === "stop_reproduce_mode") {
    try {
      const filePath = await videoRecorder.stopReproduce();

      if (!filePath) {
        return {
          content: [
            {
              type: "text",
              text: "⚠️ Reproduce mode is not active."
            }
          ]
        };
      }

      // Extract and analyze frames
      const frames = await frameProcessor.extractFrames(filePath, {
        maxFrames: 8,
        maxWidth: CONFIG.FRAME_MAX_WIDTH,
        quality: CONFIG.FRAME_QUALITY,
        skipSimilar: true,
      });

      const content: any[] = [
        {
          type: "text",
          text: `⏹️ Recording stopped!\n\n` +
                `Captured ${frames.length} key frames. Analyzing...`
        }
      ];

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]!;
        content.push({
          type: "text",
          text: `\n📍 Frame ${i + 1}/${frames.length}`
        });
        content.push({
          type: "image",
          data: frame.buffer.toString('base64'),
          mimeType: "image/jpeg"
        });
      }

      // Restart blackbox
      await videoRecorder.startBlackbox();
      console.error("[System] Blackbox recording resumed.");

      return { content };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ ${error.message}`
          }
        ]
      };
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

// --- Main Execution ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vision Context MCP Server running...");
}

// Cleanup on exit
process.on("SIGINT", async () => {
  console.error("\n[System] Shutting down...");
  await videoRecorder.stopRecording();
  videoRecorder.cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("\n[System] Shutting down...");
  await videoRecorder.stopRecording();
  videoRecorder.cleanup();
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
