// Short vibrations confirm an action without looking at the screen (Android; iPhones ignore web vibration).
const PATTERNS = {
  tap: 20,
  success: [30, 60, 30],
  sos: [80, 60, 80, 60, 200],
} as const;

export function buzz(kind: keyof typeof PATTERNS = "tap") {
  try {
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    // not supported
  }
}
