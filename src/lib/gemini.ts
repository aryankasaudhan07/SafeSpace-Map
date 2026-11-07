// Tried in order; the first model that answers in time wins. The fast lite model goes first so answers come in seconds.
const MODELS = (process.env.GEMINI_MODELS || "gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.5-flash,gemini-4-argon")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Total time we wait for the AI per request before the rule-based fallback answers.
const BUDGET_MS = 15_000;
const ATTEMPT_MS = 8_000;
const SKIP_MS = 10 * 60_000;

// Models that returned "no quota" / "not found" are skipped for a while instead of retried on every call.
const skipUntil = new Map<string, number>();

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callModel(model: string, prompt: string, responseSchema: object, lowThinking: boolean, timeoutMs: number) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2,
        ...(lowThinking && { thinkingConfig: { thinkingLevel: "low" } }),
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Calls Gemini with a JSON response schema and returns the parsed object and the model that answered. */
export async function generateJson<T>(prompt: string, responseSchema: object): Promise<{ data: T; model: string }> {
  const deadline = Date.now() + BUDGET_MS;
  try {
    return await tryModels<T>(prompt, responseSchema, deadline);
  } catch (err) {
    // Every model was only temporarily overloaded: wait a moment and go through the chain once more.
    if (!(err instanceof OverloadedError) || deadline - Date.now() < 3000) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return tryModels<T>(prompt, responseSchema, deadline);
  }
}

class OverloadedError extends Error {}

async function tryModels<T>(prompt: string, responseSchema: object, deadline: number): Promise<{ data: T; model: string }> {
  const errors: string[] = [];
  let allOverloaded = true;

  for (const model of MODELS) {
    if ((skipUntil.get(model) ?? 0) > Date.now()) continue;
    const remaining = deadline - Date.now();
    if (remaining < 1000) {
      errors.push("time budget used up");
      allOverloaded = false;
      break;
    }
    const timeout = Math.min(ATTEMPT_MS, remaining);
    try {
      let res = await callModel(model, prompt, responseSchema, true, timeout);
      // Some models don't accept thinkingConfig; retry once without it.
      if (res.status === 400) res = await callModel(model, prompt, responseSchema, false, Math.min(ATTEMPT_MS, deadline - Date.now()));

      if (!res.ok) {
        if (res.status === 404 || res.status === 429) skipUntil.set(model, Date.now() + SKIP_MS);
        // Quota / not-found models are skipped from now on, so they don't block the overload retry.
        if (![503, 429, 404].includes(res.status)) allOverloaded = false;
        errors.push(`${model}: ${res.status} ${(await res.text()).slice(0, 120)}`);
        continue;
      }

      const body = await res.json();
      const parts: { text?: string }[] = body.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("");
      if (!text) {
        allOverloaded = false;
        errors.push(`${model}: empty response`);
        continue;
      }
      return { data: JSON.parse(text) as T, model };
    } catch (err) {
      allOverloaded = false;
      errors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const message = `All Gemini models failed:\n${errors.join("\n")}`;
  throw errors.length && allOverloaded ? new OverloadedError(message) : new Error(message);
}
