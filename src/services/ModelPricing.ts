// Shared model pricing table and cost computation.
//
// In subscription / interactive (PTY) mode the transcript has no `result`
// event, so there is no `total_cost_usd` to read. We recompute per-turn cost
// from token usage the same way the Usage Statistics aggregation does, keeping
// the 💰 bubble and status-bar cost consistent with the original (-p) version.

export interface UsageLike {
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	// Optional 5m/1h cache-creation breakdown (newer Claude Code transcripts).
	// Used to bill 1h cache writes at the higher 2x rate, matching ccusage.
	cache_creation?: {
		ephemeral_5m_input_tokens?: number;
		ephemeral_1h_input_tokens?: number;
	};
}

// Per-million-token pricing (USD). Keep in sync with the model selector list.
export const MODEL_PRICING = new Map<string, { input: number; output: number }>([
	// Opus model series pricing
	['claude-opus-4-8', { input: 5.00, output: 25.00 }],               // Opus 4.8 latest flagship (May 2026)
	['claude-opus-4-7', { input: 5.00, output: 25.00 }],               // Opus 4.7 previous flagship with self-verification
	['claude-opus-4-6', { input: 5.00, output: 25.00 }],               // Opus 4.6 previous flagship with Adaptive Thinking
	['claude-opus-4-5-20251101', { input: 5.00, output: 25.00 }],    // Opus 4.5 legacy (kept for history)
	['claude-opus-4-1-20250805', { input: 15.00, output: 75.00 }],   // Opus 4.1 flagship model
	['claude-opus-4-20250514', { input: 15.00, output: 75.00 }],     // Opus 4
	['claude-3-opus-20240229', { input: 15.00, output: 75.00 }],     // Claude 3 Opus
	// Sonnet model series pricing
	['claude-sonnet-4-6', { input: 3.00, output: 15.00 }],           // Sonnet 4.6 latest intelligent model
	['claude-sonnet-4-5-20250929', { input: 3.00, output: 15.00 }],  // Sonnet 4.5 previous intelligent model
	['claude-sonnet-4-20250514', { input: 3.00, output: 15.00 }],    // Sonnet 4
	['claude-3-5-sonnet-20241022', { input: 3.00, output: 15.00 }],  // Claude 3.5 Sonnet
	['claude-3-5-sonnet-20240620', { input: 3.00, output: 15.00 }],
	['claude-3-sonnet-20240229', { input: 3.00, output: 15.00 }],    // Claude 3 Sonnet
	// Haiku model series pricing
	['claude-haiku-4-5-20251001', { input: 1.00, output: 5.00 }],    // Haiku 4.5 cost-effective model
	['claude-3-haiku-20240307', { input: 0.25, output: 1.25 }],      // Claude 3 Haiku
]);

/**
 * Compute the USD cost of a single usage block from token counts.
 *
 * Rates are anchored to the model's input price, matching Anthropic's published
 * structure and ccusage's `calculate` mode:
 *   - cache read:        input × 0.1
 *   - cache write (5m):  input × 1.25
 *   - cache write (1h):  input × 2.0
 * When the 5m/1h breakdown is absent, all cache-creation tokens are billed at
 * the 5m rate (the historical behavior). Returns 0 when the model is unknown so
 * callers can fall back gracefully.
 */
export function computeUsageCost(usage: UsageLike, model?: string): number {
	if (!model) {
		return 0;
	}
	const pricing = MODEL_PRICING.get(model);
	if (!pricing) {
		return 0;
	}

	const inputRate = pricing.input / 1_000_000;
	const outputRate = pricing.output / 1_000_000;

	const normalInputCost = (usage.input_tokens || 0) * inputRate;
	const outputCost = (usage.output_tokens || 0) * outputRate;
	const cacheReadCost = (usage.cache_read_input_tokens || 0) * inputRate * 0.1;

	// Prefer the explicit 5m/1h breakdown when present; otherwise treat the whole
	// cache-creation total as 5m writes.
	let cacheCreationCost: number;
	const breakdown = usage.cache_creation;
	if (breakdown && (breakdown.ephemeral_5m_input_tokens != null || breakdown.ephemeral_1h_input_tokens != null)) {
		const tokens5m = breakdown.ephemeral_5m_input_tokens || 0;
		const tokens1h = breakdown.ephemeral_1h_input_tokens || 0;
		cacheCreationCost = tokens5m * inputRate * 1.25 + tokens1h * inputRate * 2.0;
	} else {
		cacheCreationCost = (usage.cache_creation_input_tokens || 0) * inputRate * 1.25;
	}

	return normalInputCost + cacheReadCost + outputCost + cacheCreationCost;
}
