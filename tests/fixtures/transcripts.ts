export type Transcript = {
    name: string;
    botTurns: string[];
};

export const transcripts: Record<string, Transcript> = {
    whiplash_spike: {
        name: "whiplash_spike",
        botTurns: [
            "He smiles softly, warmth in his eyes. \"I'm glad you're here.\"",
            "He keeps smiling, voice gentle and affectionate, lingering close.",
            "He grins again, warm and tender as he reaches for your hand.",
            "His smile vanishes; he breaks down sobbing, devastated and shaking.",
        ],
    },
    scene_persistence: {
        name: "scene_persistence",
        botTurns: [
            "In the kitchen, at night, the lights are low and the air feels tense.",
        ],
    },
    phase_and_proximity_skip: {
        name: "phase_and_proximity_skip",
        botTurns: [
            "He kisses you on the lips and pulls you into a tight embrace.",
        ],
    },
    scar_logging_and_recall: {
        name: "scar_logging_and_recall",
        botTurns: [
            "I have to tell you something. I confess I lied to you, and I kept it from you.",
            "He exhales slowly, watching your reaction in silence.",
        ],
    },
    silence_vs_action_only: {
        name: "silence_vs_action_only",
        botTurns: [
            "*nods*",
            "...",
        ],
    },
    unresolved_beats_reminder: {
        name: "unresolved_beats_reminder",
        botTurns: [
            "An awkward silence lingers between them, unfinished and unspoken.",
            "Later, he smiles softly and kisses you on the lips.",
        ],
    },
};
