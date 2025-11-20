/**
 * 환경 설정 - transformers import 전에 실행되어야 함
 */

// self를 undefined로 만들어서 BROWSER_ENV를 false로 만듦
// transformers는 `const BROWSER_ENV = typeof self !== 'undefined'`로 체크함
if (typeof globalThis.self !== 'undefined') {
  // @ts-ignore - self 제거
  delete globalThis.self;
}

// Node.js 환경임을 명시적으로 설정
Object.defineProperty(globalThis, 'BROWSER_ENV', {
  value: false,
  writable: false,
  configurable: false,
  enumerable: true
});

// 추가 환경 변수
process.env.TRANSFORMERS_OFFLINE = "1";
