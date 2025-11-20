/**
 * Video Recorder Module
 * Handles rolling buffer (blackbox) and reproduce mode recording using @arcsine/screen-recorder
 */

import { Recorder, RecorderOptions } from "@arcsine/screen-recorder";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";

interface RecordingSegment {
  filePath: string;
  startTime: number;
  endTime: number;
}

export class VideoRecorder {
  private recorder: Recorder | null = null;
  private isRecording = false;
  private segments: RecordingSegment[] = [];
  private currentSegmentIndex = 0;
  private maxSegments: number;
  private segmentDurationSeconds: number;
  private recordingMode: "blackbox" | "reproduce" | null = null;
  private reproduceStartTime: number = 0;
  private reproduceFilePath: string | null = null;

  constructor(
    private bufferDurationSeconds: number = 60,
    segmentDurationSeconds: number = 10
  ) {
    this.segmentDurationSeconds = segmentDurationSeconds;
    this.maxSegments = Math.ceil(bufferDurationSeconds / segmentDurationSeconds);
  }

  /**
   * Start blackbox mode - continuous rolling buffer recording
   */
  async startBlackbox(options: Partial<RecorderOptions> = {}): Promise<void> {
    if (this.isRecording) {
      console.error("[VideoRecorder] Already recording");
      return;
    }

    this.recordingMode = "blackbox";
    await this.startNextSegment(options);
  }

  /**
   * Start reproduce mode - intentional bug reproduction recording
   */
  async startReproduce(options: Partial<RecorderOptions> = {}): Promise<string> {
    if (this.isRecording && this.recordingMode === "reproduce") {
      throw new Error("Reproduce mode already active");
    }

    // Stop blackbox if running
    if (this.recordingMode === "blackbox") {
      await this.stopRecording();
    }

    this.recordingMode = "reproduce";
    this.reproduceStartTime = Date.now();
    this.reproduceFilePath = join(tmpdir(), `reproduce-${Date.now()}.mp4`);

    const recorderOptions: RecorderOptions = {
      file: this.reproduceFilePath,
      fps: 30,
      duration: 300, // 5 minutes max
      ...options,
    };

    this.recorder = new Recorder(recorderOptions);
    await this.recorder.start();
    this.isRecording = true;

    console.error(`[VideoRecorder] Reproduce mode started: ${this.reproduceFilePath}`);
    return this.reproduceFilePath;
  }

  /**
   * Stop reproduce mode and return the recorded file path
   */
  async stopReproduce(): Promise<string | null> {
    if (this.recordingMode !== "reproduce" || !this.recorder) {
      throw new Error("Reproduce mode not active");
    }

    await this.stopRecording();
    const filePath = this.reproduceFilePath;
    this.reproduceFilePath = null;
    this.reproduceStartTime = 0;
    this.recordingMode = null;

    console.error(`[VideoRecorder] Reproduce mode stopped: ${filePath}`);
    return filePath;
  }

  /**
   * Get recent recording segments from blackbox buffer
   */
  getRecentSegments(durationSeconds: number): RecordingSegment[] {
    const cutoffTime = Date.now() - durationSeconds * 1000;
    return this.segments.filter((seg) => seg.endTime >= cutoffTime);
  }

  /**
   * Stop all recording
   */
  async stopRecording(): Promise<void> {
    if (!this.recorder || !this.isRecording) return;

    await this.recorder.stop();
    this.recorder = null;
    this.isRecording = false;
  }

  /**
   * Cleanup all segments
   */
  cleanup(): void {
    for (const segment of this.segments) {
      try {
        if (existsSync(segment.filePath)) {
          unlinkSync(segment.filePath);
        }
      } catch (e) {
        console.error(`[VideoRecorder] Failed to delete segment: ${segment.filePath}`, e);
      }
    }
    this.segments = [];

    if (this.reproduceFilePath && existsSync(this.reproduceFilePath)) {
      try {
        unlinkSync(this.reproduceFilePath);
      } catch (e) {
        console.error(`[VideoRecorder] Failed to delete reproduce file`, e);
      }
    }
  }

  /**
   * Start recording next segment for blackbox mode
   */
  private async startNextSegment(options: Partial<RecorderOptions> = {}): Promise<void> {
    if (this.recordingMode !== "blackbox") return;

    const startTime = Date.now();
    const filePath = join(tmpdir(), `blackbox-${this.currentSegmentIndex}-${startTime}.mp4`);

    const recorderOptions: RecorderOptions = {
      file: filePath,
      fps: 15, // Lower FPS for efficiency
      duration: this.segmentDurationSeconds,
      ...options,
    };

    this.recorder = new Recorder(recorderOptions);
    await this.recorder.start();
    this.isRecording = true;

    // Schedule next segment
    setTimeout(async () => {
      const endTime = Date.now();

      // Add current segment to buffer
      this.segments.push({ filePath, startTime, endTime });

      // Remove oldest segment if buffer is full
      if (this.segments.length > this.maxSegments) {
        const oldSegment = this.segments.shift()!;
        try {
          if (existsSync(oldSegment.filePath)) {
            unlinkSync(oldSegment.filePath);
          }
        } catch (e) {
          console.error(`[VideoRecorder] Failed to delete old segment`, e);
        }
      }

      await this.stopRecording();

      // Start next segment if still in blackbox mode
      this.currentSegmentIndex = (this.currentSegmentIndex + 1) % this.maxSegments;
      if (this.recordingMode === "blackbox") {
        await this.startNextSegment(options);
      }
    }, this.segmentDurationSeconds * 1000);

    console.error(`[VideoRecorder] Blackbox segment started: ${filePath}`);
  }

  /**
   * Check if currently recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current recording mode
   */
  getMode(): "blackbox" | "reproduce" | null {
    return this.recordingMode;
  }
}
