#!/usr/bin/env node
/**
 * 이미지 처리 테스트
 */

// 환경 설정을 가장 먼저 import
import "./env-setup.js";

const { RawImage } = await import("@xenova/transformers");
import screenshot from "screenshot-desktop";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

console.log("스크린샷 캡처 중...");
const imgBuff = await screenshot({ format: "png" });
console.log("스크린샷 캡처 완료:", imgBuff.length, "bytes");

const tempPath = join(tmpdir(), `test-screen-${Date.now()}.png`);
console.log("임시 파일 저장:", tempPath);
writeFileSync(tempPath, imgBuff);

console.log("RawImage로 읽기 시도...");
try {
  const image = await RawImage.read(tempPath);
  console.log("✅ 성공! 이미지 크기:", image.width, "x", image.height);
  console.log("이미지 채널:", image.channels);
} catch (error) {
  console.error("❌ 실패:", error.message);
  console.error(error.stack);
  process.exit(1);
}

console.log("테스트 완료");
process.exit(0);
