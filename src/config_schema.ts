/**
 * Config schema and normalization utilities for the Romance Realism Pack.
 * Ensures null-safety, default fallbacks, and range clamping for numeric fields.
 */

export type ConfigSchema = {
    enabled?: boolean;
    strictness?: number; // 1..3
    memory_depth?: number; // 5..30
    [key: string]: any;
};

export type NormalizedConfig = Omit<ConfigSchema, 'enabled' | 'strictness' | 'memory_depth'> & {
    enabled: boolean;
    strictness: number;
    memory_depth: number;
};

export const DEFAULT_CONFIG: NormalizedConfig = {
    enabled: true,
    strictness: 2,
    memory_depth: 15,
} as const;

function clamp(n: number, min: number, max: number): number {
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
}

/**
 * Normalize a possibly-partial or null config object into a fully-populated, safe config.
 * - Treats missing or null fields as absent and substitutes defaults.
 * - Clamps `strictness` to [1,3] and `memory_depth` to [5,30].
 */
export function normalizeConfig(cfg?: ConfigSchema | null): NormalizedConfig {
    const src = cfg || {};
    const enabled = typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_CONFIG.enabled;
    const strictness = (typeof src.strictness === 'number')
        ? clamp(Math.floor(src.strictness), 1, 3)
        : DEFAULT_CONFIG.strictness;
    const memory_depth = (typeof src.memory_depth === 'number')
        ? clamp(Math.floor(src.memory_depth), 5, 30)
        : DEFAULT_CONFIG.memory_depth;

    return {
        enabled,
        strictness,
        memory_depth,
        // preserve unknown keys but do not trust their types
        ...Object.keys(src).reduce((acc: any, k) => {
            if (!['enabled', 'strictness', 'memory_depth'].includes(k)) acc[k] = (src as any)[k];
            return acc;
        }, {}),
    };
}

/**
 * Lightweight validator that returns an array of human-readable errors (empty when valid).
 */
export function validateConfig(cfg?: ConfigSchema | null): string[] {
    const errors: string[] = [];
    if (cfg == null) return errors;
    if (cfg.enabled != null && typeof cfg.enabled !== 'boolean') errors.push('`enabled` must be a boolean.');
    if (cfg.strictness != null && (typeof cfg.strictness !== 'number' || !Number.isFinite(cfg.strictness))) errors.push('`strictness` must be a number.');
    if (cfg.memory_depth != null && (typeof cfg.memory_depth !== 'number' || !Number.isFinite(cfg.memory_depth))) errors.push('`memory_depth` must be a number.');
    return errors;
}

export default {
    DEFAULT_CONFIG,
    normalizeConfig,
    validateConfig,
};
