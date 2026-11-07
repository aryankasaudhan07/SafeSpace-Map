// Tried in order; the first model that answers in time wins. The fast lite model goes first so answers come in seconds.
const MODELS = (process.env.GEMINI_MODELS || "gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.5-flash,gemini-4-argon")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Total time we wait for the AI per request before the rule-based fallback answers.
const BUDGET_MS = 15_000;
const ATTEMPT_MS = 8_000;
const SKIP_MS = 10 * 60_000;
// If a model hasn't answered by then, the next one is asked too and the first good answer wins.
const HEDGE_MS = 3_000;

// Models that returned "no quota" / "not found" are skipped for a while instead of retried on every call.
const skipUntil = new Map<string, number>();

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callModel(model: string, prompt: string, responseSchema: object, lowThinking: boolean, timeoutMs: number, signal: AbortSignal) {
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
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]),
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

class ModelError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function askModel<T>(model: string, prompt: string, responseSchema: object, deadline: number, signal: AbortSignal) {
  let res = await callModel(model, prompt, responseSchema, true, Math.min(ATTEMPT_MS, deadline - Date.now()), signal);
  // Some models don't accept thinkingConfig; retry once without it.
  if (res.status === 400) res = await callModel(model, prompt, responseSchema, false, Math.min(ATTEMPT_MS, deadline - Date.now()), signal);
  if (!res.ok) {
    // Quota / not-found models are skipped for a while, so they don't slow down later requests.
    if (res.status === 404 || res.status === 429) skipUntil.set(model, Date.now() + SKIP_MS);
    throw new ModelError(`${model}: ${res.status} ${(await res.text()).slice(0, 120)}`, res.status);
  }
  const body = await res.json();
  const parts: { text?: string }[] = body.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  if (!text) throw new ModelError(`${model}: empty response`, 0);
  return { data: JSON.parse(text) as T, model };
}

/** Asks the models in order, starting the next one early (HEDGE_MS) or as soon as one fails; the first good answer wins. */
function tryModels<T>(prompt: string, responseSchema: object, deadline: number): Promise<{ data: T; model: string }> {
  const models = MODELS.filter((m) => (skipUntil.get(m) ?? 0) <= Date.now());
  const ctrl = new AbortController();
  const errors: string[] = [];
  let allOverloaded = true;
  return new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = () => {
      if (done || running > 0 || next < models.length) return;
      done = true;
      const message = `All Gemini models failed:\n${errors.join("\n")}`;
      reject(errors.length && allOverloaded ? new OverloadedError(message) : new Error(message));
    };
    const launch = () => {
      clearTimeout(timer);
      if (done) return;
      if (next < models.length && deadline - Date.now() < 1000) {
        errors.push("time budget used up");
        allOverloaded = false;
        next = models.length;
      }
      if (next >= models.length) return giveUp();
      const model = models[next++];
      running++;
      askModel<T>(model, prompt, responseSchema, deadline, ctrl.signal).then(
        (result) => {
          running--;
          if (done) return;
          done = true;
          clearTimeout(timer);
          ctrl.abort();
          resolve(result);
        },
        (err) => {
          running--;
          if (done) return;
          if (!(err instanceof ModelError && [503, 429, 404].includes(err.status))) allOverloaded = false;
          errors.push(err instanceof Error ? err.message : String(err));
          launch();
        },
      );
      timer = setTimeout(launch, HEDGE_MS);
    };
    launch();
  });
}
