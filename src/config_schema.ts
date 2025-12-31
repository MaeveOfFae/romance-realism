/**
 * Config schema and normalization utilities for the Romance Realism Pack.
 * Ensures null-safety, default fallbacks, and range clamping for numeric fields.
 */

export type ConfigSchema = {
    enabled?: boolean;
    strictness?: number; // 1..3
    memory_depth?: number; // 5..30
    ui_enabled?: boolean | number;
    ui_max_notes?: number; // 1..50
    ui_show_status?: boolean | number;
    ui_show_timestamps?: boolean | number;
    max_ui_notes_per_20?: number; // -1 disables override, otherwise 0..20
    ui_debug_scoring?: boolean | number;
    ui_debug_max_candidates?: number; // 1..50

    note_scene_summary?: boolean | number;
    note_emotion_delta?: boolean | number;
    note_phase?: boolean | number;
    note_proximity?: boolean | number;
    note_consent?: boolean | number;
    note_subtext?: boolean | number;
    note_silence?: boolean | number;
    note_drift?: boolean | number;
    note_scar_recall?: boolean | number;

    tune_phase_weight_threshold?: number; // null/undefined -> strictness defaults, otherwise 1..20
    tune_delta_score_threshold?: number; // null/undefined -> strictness defaults, otherwise 0..20
    tune_ui_note_parts?: number; // null/undefined -> strictness defaults, otherwise 1..6

    [key: string]: unknown;
};

export type NormalizedConfig = Omit<ConfigSchema, 'enabled' | 'strictness' | 'memory_depth'
    | 'ui_enabled' | 'ui_max_notes' | 'ui_show_status' | 'ui_show_timestamps' | 'max_ui_notes_per_20'
    | 'ui_debug_scoring' | 'ui_debug_max_candidates'
    | 'note_scene_summary' | 'note_emotion_delta' | 'note_phase' | 'note_proximity' | 'note_consent'
    | 'note_subtext' | 'note_silence' | 'note_drift' | 'note_scar_recall'> & {
    enabled: boolean;
    strictness: number;
    memory_depth: number;

    ui_enabled: boolean;
    ui_max_notes: number;
    ui_show_status: boolean;
    ui_show_timestamps: boolean;
    max_ui_notes_per_20: number | null;
    ui_debug_scoring: boolean;
    ui_debug_max_candidates: number;

    note_scene_summary: boolean;
    note_emotion_delta: boolean;
    note_phase: boolean;
    note_proximity: boolean;
    note_consent: boolean;
    note_subtext: boolean;
    note_silence: boolean;
    note_drift: boolean;
    note_scar_recall: boolean;

    tune_phase_weight_threshold: number | null;
    tune_delta_score_threshold: number | null;
    tune_ui_note_parts: number | null;
};

export const DEFAULT_CONFIG: NormalizedConfig = {
    enabled: true,
    strictness: 2,
    memory_depth: 15,
    ui_enabled: true,
    ui_max_notes: 10,
    ui_show_status: true,
    ui_show_timestamps: true,
    max_ui_notes_per_20: null,
    ui_debug_scoring: false,
    ui_debug_max_candidates: 12,

    note_scene_summary: true,
    note_emotion_delta: true,
    note_phase: true,
    note_proximity: true,
    note_consent: true,
    note_subtext: true,
    note_silence: true,
    note_drift: true,
    note_scar_recall: true,

    tune_phase_weight_threshold: null,
    tune_delta_score_threshold: null,
    tune_ui_note_parts: null,
} as const;

function clamp(n: number, min: number, max: number): number {
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function asBool(v: unknown, fallback: boolean): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v !== 0;
    return fallback;
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

    const ui_enabled = asBool(src.ui_enabled, DEFAULT_CONFIG.ui_enabled);
    const ui_max_notes = (typeof src.ui_max_notes === 'number')
        ? clamp(Math.floor(src.ui_max_notes), 1, 50)
        : DEFAULT_CONFIG.ui_max_notes;
    const ui_show_status = asBool(src.ui_show_status, DEFAULT_CONFIG.ui_show_status);
    const ui_show_timestamps = asBool(src.ui_show_timestamps, DEFAULT_CONFIG.ui_show_timestamps);
    const maxOverrideRaw = (typeof src.max_ui_notes_per_20 === 'number' && Number.isFinite(src.max_ui_notes_per_20))
        ? Math.floor(src.max_ui_notes_per_20)
        : null;
    const max_ui_notes_per_20 = maxOverrideRaw == null
        ? DEFAULT_CONFIG.max_ui_notes_per_20
        : (maxOverrideRaw < 0 ? null : clamp(maxOverrideRaw, 0, 20));
    const ui_debug_scoring = asBool(src.ui_debug_scoring, DEFAULT_CONFIG.ui_debug_scoring);
    const ui_debug_max_candidates = (typeof src.ui_debug_max_candidates === 'number')
        ? clamp(Math.floor(src.ui_debug_max_candidates), 1, 50)
        : DEFAULT_CONFIG.ui_debug_max_candidates;

    const note_scene_summary = asBool(src.note_scene_summary, DEFAULT_CONFIG.note_scene_summary);
    const note_emotion_delta = asBool(src.note_emotion_delta, DEFAULT_CONFIG.note_emotion_delta);
    const note_phase = asBool(src.note_phase, DEFAULT_CONFIG.note_phase);
    const note_proximity = asBool(src.note_proximity, DEFAULT_CONFIG.note_proximity);
    const note_consent = asBool(src.note_consent, DEFAULT_CONFIG.note_consent);
    const note_subtext = asBool(src.note_subtext, DEFAULT_CONFIG.note_subtext);
    const note_silence = asBool(src.note_silence, DEFAULT_CONFIG.note_silence);
    const note_drift = asBool(src.note_drift, DEFAULT_CONFIG.note_drift);
    const note_scar_recall = asBool(src.note_scar_recall, DEFAULT_CONFIG.note_scar_recall);

    const tune_phase_weight_threshold = (typeof src.tune_phase_weight_threshold === 'number' && Number.isFinite(src.tune_phase_weight_threshold))
        ? clamp(Math.floor(src.tune_phase_weight_threshold), 1, 20)
        : DEFAULT_CONFIG.tune_phase_weight_threshold;
    const tune_delta_score_threshold = (typeof src.tune_delta_score_threshold === 'number' && Number.isFinite(src.tune_delta_score_threshold))
        ? clamp(Math.floor(src.tune_delta_score_threshold), 0, 20)
        : DEFAULT_CONFIG.tune_delta_score_threshold;
    const tune_ui_note_parts = (typeof src.tune_ui_note_parts === 'number' && Number.isFinite(src.tune_ui_note_parts))
        ? clamp(Math.floor(src.tune_ui_note_parts), 1, 6)
        : DEFAULT_CONFIG.tune_ui_note_parts;

    return {
        enabled,
        strictness,
        memory_depth,
        ui_enabled,
        ui_max_notes,
        ui_show_status,
        ui_show_timestamps,
        max_ui_notes_per_20,
        ui_debug_scoring,
        ui_debug_max_candidates,

        note_scene_summary,
        note_emotion_delta,
        note_phase,
        note_proximity,
        note_consent,
        note_subtext,
        note_silence,
        note_drift,
        note_scar_recall,

        tune_phase_weight_threshold,
        tune_delta_score_threshold,
        tune_ui_note_parts,
        // preserve unknown keys but do not trust their types
        ...Object.keys(src).reduce((acc: Record<string, unknown>, k) => {
            if (![
                'enabled', 'strictness', 'memory_depth',
                'ui_enabled', 'ui_max_notes', 'ui_show_status', 'ui_show_timestamps', 'max_ui_notes_per_20',
                'ui_debug_scoring', 'ui_debug_max_candidates',
                'note_scene_summary', 'note_emotion_delta', 'note_phase', 'note_proximity', 'note_consent',
                'note_subtext', 'note_silence', 'note_drift', 'note_scar_recall',
                'tune_phase_weight_threshold', 'tune_delta_score_threshold', 'tune_ui_note_parts',
            ].includes(k)) {
                acc[k] = (src as any)[k];
            }
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
    if (cfg.ui_enabled != null && !(typeof cfg.ui_enabled === 'boolean' || typeof cfg.ui_enabled === 'number')) errors.push('`ui_enabled` must be a boolean (or 0/1).');
    if (cfg.ui_max_notes != null && (typeof cfg.ui_max_notes !== 'number' || !Number.isFinite(cfg.ui_max_notes))) errors.push('`ui_max_notes` must be a number.');
    if (cfg.ui_show_status != null && !(typeof cfg.ui_show_status === 'boolean' || typeof cfg.ui_show_status === 'number')) errors.push('`ui_show_status` must be a boolean (or 0/1).');
    if (cfg.ui_show_timestamps != null && !(typeof cfg.ui_show_timestamps === 'boolean' || typeof cfg.ui_show_timestamps === 'number')) errors.push('`ui_show_timestamps` must be a boolean (or 0/1).');
    if (cfg.max_ui_notes_per_20 != null && (typeof cfg.max_ui_notes_per_20 !== 'number' || !Number.isFinite(cfg.max_ui_notes_per_20))) errors.push('`max_ui_notes_per_20` must be a number.');
    if (cfg.ui_debug_scoring != null && !(typeof cfg.ui_debug_scoring === 'boolean' || typeof cfg.ui_debug_scoring === 'number')) errors.push('`ui_debug_scoring` must be a boolean (or 0/1).');
    if (cfg.ui_debug_max_candidates != null && (typeof cfg.ui_debug_max_candidates !== 'number' || !Number.isFinite(cfg.ui_debug_max_candidates))) errors.push('`ui_debug_max_candidates` must be a number.');
    if (cfg.tune_phase_weight_threshold != null && (typeof cfg.tune_phase_weight_threshold !== 'number' || !Number.isFinite(cfg.tune_phase_weight_threshold))) errors.push('`tune_phase_weight_threshold` must be a number.');
    if (cfg.tune_delta_score_threshold != null && (typeof cfg.tune_delta_score_threshold !== 'number' || !Number.isFinite(cfg.tune_delta_score_threshold))) errors.push('`tune_delta_score_threshold` must be a number.');
    if (cfg.tune_ui_note_parts != null && (typeof cfg.tune_ui_note_parts !== 'number' || !Number.isFinite(cfg.tune_ui_note_parts))) errors.push('`tune_ui_note_parts` must be a number.');

    for (const k of [
        'note_scene_summary', 'note_emotion_delta', 'note_phase', 'note_proximity', 'note_consent',
        'note_subtext', 'note_silence', 'note_drift', 'note_scar_recall',
    ] as const) {
        const v = (cfg as any)[k];
        if (v != null && !(typeof v === 'boolean' || typeof v === 'number')) errors.push(`\`${k}\` must be a boolean (or 0/1).`);
    }
    return errors;
}

export default {
    DEFAULT_CONFIG,
    normalizeConfig,
    validateConfig,
};
