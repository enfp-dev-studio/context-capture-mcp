/**
 * Frame Processor Module
 * Extracts frames from video and optimizes them for LLM consumption
 */

import { spawn } from "child_process";
import sharp from "sharp";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";

export interface ProcessedFrame {
  buffer: Buffer;
  timestamp: number;
  diffScore?: number;
}

export interface FrameExtractionOptions {
  maxFrames?: number; // Maximum number of frames to extract
  maxWidth?: number; // Maximum width for resizing
  quality?: number; // JPEG quality (1-100)
  skipSimilar?: boolean; // Skip frames that are too similar
  similarityThreshold?: number; // Pixel difference threshold for similarity (0-1)
}

export class FrameProcessor {
  /**
   * Extract frames from video file
   */
  async extractFrames(
    videoPath: string,
    options: FrameExtractionOptions = {}
  ): Promise<ProcessedFrame[]> {
    const {
      maxFrames = 10,
      maxWidth = 1280,
      quality = 85,
      skipSimilar = true,
      similarityThreshold = 0.03,
    } = options;

    const outputDir = join(tmpdir(), `frames-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    try {
      // Extract frames using ffmpeg
      const rawFrames = await this.extractRawFrames(videoPath, outputDir, maxFrames * 2);

      // Process and optimize frames
      const processedFrames: ProcessedFrame[] = [];
      let previousBuffer: Buffer | null = null;

      for (const framePath of rawFrames) {
        // Resize and compress
        const buffer = await sharp(framePath)
          .resize(maxWidth, null, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer();

        // Check similarity with previous frame
        if (skipSimilar && previousBuffer) {
          const similarity = await this.calculateSimilarity(previousBuffer, buffer);
          if (similarity < similarityThreshold) {
            // Skip similar frames
            continue;
          }
        }

        processedFrames.push({
          buffer,
          timestamp: Date.now(),
          diffScore: previousBuffer
            ? await this.calculateSimilarity(previousBuffer, buffer)
            : undefined,
        });

        previousBuffer = buffer;

        // Stop if we have enough frames
        if (processedFrames.length >= maxFrames) {
          break;
        }
      }

      return processedFrames;
    } finally {
      // Cleanup temporary frames
      this.cleanupDirectory(outputDir);
    }
  }

  /**
   * Extract raw frames from video using ffmpeg
   */
  private extractRawFrames(
    videoPath: string,
    outputDir: string,
    maxFrames: number
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const outputPattern = join(outputDir, "frame-%04d.png");

      // Use ffmpeg to extract frames evenly distributed across the video
      const ffmpeg = spawn("ffmpeg", [
        "-i",
        videoPath,
        "-vf",
        `select='not(mod(n\\,floor(duration*fps/${maxFrames})))'`,
        "-vsync",
        "vfr",
        "-frames:v",
        maxFrames.toString(),
        outputPattern,
      ]);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed: ${stderr}`));
          return;
        }

        // Collect extracted frame paths
        const frames: string[] = [];
        for (let i = 1; i <= maxFrames; i++) {
          const framePath = join(outputDir, `frame-${i.toString().padStart(4, "0")}.png`);
          if (existsSync(framePath)) {
            frames.push(framePath);
          }
        }

        resolve(frames);
      });

      ffmpeg.on("error", reject);
    });
  }

  /**
   * Calculate similarity between two images (returns 0-1, where 1 = completely different)
   */
  private async calculateSimilarity(buffer1: Buffer, buffer2: Buffer): Promise<number> {
    try {
      // Convert both to PNG for comparison
      const png1Data = await sharp(buffer1).png().toBuffer();
      const png2Data = await sharp(buffer2).png().toBuffer();

      const img1 = PNG.sync.read(png1Data);
      const img2 = PNG.sync.read(png2Data);

      // Ensure same dimensions
      if (img1.width !== img2.width || img1.height !== img2.height) {
        return 1.0; // Completely different if dimensions don't match
      }

      const { width, height } = img1;
      const diff = new PNG({ width, height });

      const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
        threshold: 0.1,
      });

      return numDiffPixels / (width * height);
    } catch (error) {
      console.error("[FrameProcessor] Error calculating similarity:", error);
      return 1.0; // Assume different on error
    }
  }

  /**
   * Cleanup temporary directory
   */
  private cleanupDirectory(dir: string): void {
    try {
      const fs = require("fs");
      if (existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          unlinkSync(join(dir, file));
        }
        fs.rmdirSync(dir);
      }
    } catch (error) {
      console.error("[FrameProcessor] Cleanup failed:", error);
    }
  }

  /**
   * Optimize single screenshot for LLM consumption
   */
  async optimizeScreenshot(
    buffer: Buffer,
    options: { maxWidth?: number; quality?: number } = {}
  ): Promise<Buffer> {
    const { maxWidth = 1280, quality = 85 } = options;

    return await sharp(buffer)
      .resize(maxWidth, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }
}
