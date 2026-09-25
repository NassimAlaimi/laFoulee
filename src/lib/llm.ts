/**
 * Fournisseur LLM minimal (fetch, pas de SDK — donc pas de dépendance).
 * Décision : DeepSeek dans un premier temps (API compatible OpenAI), derrière
 * une interface d'une vingtaine de lignes pour brancher un modèle local
 * (Ollama) plus tard sans rien réécrire.
 */

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmProvider = {
  name: string;
  complete(messages: LlmMessage[], opts?: { json?: boolean; maxTokens?: number }): Promise<string>;
};

export function llmConfig() {
  return {
    key: process.env.LLM_API_KEY ?? "",
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.LLM_MODEL ?? "deepseek-chat",
  };
}

export function isLlmConfigured(): boolean {
  return Boolean(llmConfig().key);
}

/** DeepSeek (compatible OpenAI /chat/completions). */
export const deepseekProvider: LlmProvider = {
  name: "deepseek",
  async complete(messages, opts) {
    const { key, baseUrl, model } = llmConfig();
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: opts?.maxTokens ?? 800,
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`llm:${res.status}:${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  },
};

/** Fournisseur local (Ollama, /v1) — activable plus tard. */
export const ollamaProvider: LlmProvider = {
  name: "ollama",
  async complete(messages) {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.LLM_MODEL ?? "qwen2.5", messages, temperature: 0.4 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`llm:${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  },
};

export function provider(): LlmProvider {
  return process.env.LLM_LOCAL === "1" ? ollamaProvider : deepseekProvider;
}
