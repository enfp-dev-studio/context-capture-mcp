import { describe, test, expect } from 'bun:test';
import { findWindowByTitle, getAvailableWindowsList, findMostLikelyTargetWindow, type Window } from '../src/helpers';

// Mock iOS Simulator windows
const mockWindows: Window[] = [
  {
    id: 1,
    getTitle: () => 'iOS Simulator',
    getBounds: () => ({ x: 100, y: 100, width: 390, height: 844 }),
    path: '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app'
  },
  {
    id: 2,
    getTitle: () => 'Xcode',
    getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    path: '/Applications/Xcode.app'
  },
  {
    id: 3,
    getTitle: () => 'Visual Studio Code',
    getBounds: () => ({ x: 500, y: 100, width: 1200, height: 800 }),
    path: '/Applications/Visual Studio Code.app'
  },
  {
    id: 4,
    getTitle: () => 'Terminal',
    getBounds: () => ({ x: 800, y: 400, width: 800, height: 600 }),
    path: '/System/Applications/Utilities/Terminal.app'
  }
];

describe('findWindowByTitle', () => {
  test('iOS Simulator - exact match', () => {
    const result = findWindowByTitle('iOS Simulator', mockWindows);
    expect(result?.id).toBe(1);
    expect(result?.getTitle()).toBe('iOS Simulator');
  });

  test('iOS Simulator - starts with "iOS"', () => {
    const result = findWindowByTitle('iOS', mockWindows);
    expect(result?.id).toBe(1);
  });

  test('iOS Simulator - starts with "Simulator"', () => {
    const result = findWindowByTitle('Simulator', mockWindows);
    expect(result?.id).toBe(1);
  });

  test('iOS Simulator - partial match "Sim"', () => {
    const result = findWindowByTitle('Sim', mockWindows);
    expect(result?.id).toBe(1);
  });

  test('case insensitive - "ios simulator"', () => {
    const result = findWindowByTitle('ios simulator', mockWindows);
    expect(result?.id).toBe(1);
  });

  test('case insensitive - "IOS SIMULATOR"', () => {
    const result = findWindowByTitle('IOS SIMULATOR', mockWindows);
    expect(result?.id).toBe(1);
  });

  test('whitespace trimming - "  iOS Simulator  "', () => {
    const result = findWindowByTitle('  iOS Simulator  ', mockWindows);
    expect(result?.id).toBe(1);
  });

  test('Xcode - exact match', () => {
    const result = findWindowByTitle('Xcode', mockWindows);
    expect(result?.id).toBe(2);
  });

  test('Terminal - partial match', () => {
    const result = findWindowByTitle('Term', mockWindows);
    expect(result?.id).toBe(4);
  });

  test('no match - returns undefined', () => {
    const result = findWindowByTitle('Firefox', mockWindows);
    expect(result).toBeUndefined();
  });

  test('empty string - returns undefined', () => {
    const result = findWindowByTitle('', mockWindows);
    expect(result).toBeUndefined();
  });
});

describe('getAvailableWindowsList', () => {
  test('formats iOS Simulator window list correctly', () => {
    const result = getAvailableWindowsList(mockWindows);

    expect(result).toContain('1. "iOS Simulator"');
    expect(result).toContain('2. "Xcode"');
    expect(result).toContain('3. "Visual Studio Code"');
    expect(result).toContain('4. "Terminal"');
  });

  test('returns message for empty list', () => {
    const result = getAvailableWindowsList([]);
    expect(result).toBe('No windows currently available.');
  });

  test('filters out windows with empty titles', () => {
    const windowsWithEmpty: Window[] = [
      ...mockWindows,
      {
        id: 5,
        getTitle: () => '',
        getBounds: () => ({}),
        path: '/some/path'
      },
      {
        id: 6,
        getTitle: () => '   ',
        getBounds: () => ({}),
        path: '/some/path'
      }
    ];

    const result = getAvailableWindowsList(windowsWithEmpty);
    const lines = result.split('\n');

    // Should only have 4 windows (not 6)
    expect(lines.length).toBe(4);
  });

  test('limits to 20 windows', () => {
    const manyWindows: Window[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      getTitle: () => `Window ${i + 1}`,
      getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      path: '/Applications/App.app'
    }));

    const result = getAvailableWindowsList(manyWindows);
    const lines = result.split('\n');

    expect(lines.length).toBe(20);
  });
});

describe('findMostLikelyTargetWindow', () => {
  test('finds iOS Simulator with "simulator" priority', () => {
    const priorities = ['simulator', 'emulator', 'godot'];
    const result = findMostLikelyTargetWindow(mockWindows, priorities);

    expect(result?.id).toBe(1);
    expect(result?.getTitle()).toBe('iOS Simulator');
  });

  test('prioritizes by order - simulator before xcode', () => {
    const priorities = ['simulator', 'xcode'];
    const result = findMostLikelyTargetWindow(mockWindows, priorities);

    expect(result?.getTitle()).toBe('iOS Simulator');
  });

  test('finds Xcode when simulator not in priorities', () => {
    const priorities = ['xcode', 'terminal'];
    const result = findMostLikelyTargetWindow(mockWindows, priorities);

    expect(result?.getTitle()).toBe('Xcode');
  });

  test('case insensitive matching', () => {
    const priorities = ['SIMULATOR', 'XCODE'];
    const result = findMostLikelyTargetWindow(mockWindows, priorities);

    expect(result?.getTitle()).toBe('iOS Simulator');
  });

  test('regex pattern matching - ".*simulator.*"', () => {
    const priorities = ['.*simulator.*'];
    const result = findMostLikelyTargetWindow(mockWindows, priorities);

    expect(result?.getTitle()).toBe('iOS Simulator');
  });

  test('returns null when no match found', () => {
    const priorities = ['firefox', 'chrome', 'safari'];
    const result = findMostLikelyTargetWindow(mockWindows, priorities);

    expect(result).toBeNull();
  });

  test('empty priorities returns null', () => {
    const result = findMostLikelyTargetWindow(mockWindows, []);
    expect(result).toBeNull();
  });
});
