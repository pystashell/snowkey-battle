const INPUT_TIMEOUT_MS = 1500;

export async function finishMatchByTyping({
  input, getSnapshot, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = now() + 70_000;
  while (now() < deadline && getSnapshot().phase === "playing") {
    try {
      if (await input.isEnabled({ timeout: INPUT_TIMEOUT_MS })) {
        if (getSnapshot().phase === "ended") break;
        const word = getSnapshot().words.find((candidate) => candidate.expiresAt > now() + 300);
        if (word) {
          await input.press("Escape", { timeout: INPUT_TIMEOUT_MS });
          if (getSnapshot().phase === "ended") break;
          await input.fill(word.text, { timeout: INPUT_TIMEOUT_MS });
        }
      }
    } catch (error) {
      // Only an input timeout accompanied by an authoritative ended snapshot
      // can finish this loop. The caller still checks both results and rematch.
      if (error?.name !== "TimeoutError" || getSnapshot().phase !== "ended") throw error;
      break;
    }
    await sleep(350);
  }
}
