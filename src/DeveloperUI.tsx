import {useEffect, useMemo, useState} from "react";

export type DeveloperUIProps = {
    stage: unknown;
};

function safeStringify(value: unknown, maxChars: number = 30_000): string {
    const seen = new WeakSet<object>();
    let serialized = "";
    try {
        serialized = JSON.stringify(
            value,
            (_key, v: unknown) => {
                if (typeof v === "bigint") return v.toString();
                if (typeof v === "function") {
                    const fn = v as (...args: unknown[]) => unknown;
                    const name = (fn as {name?: string}).name || "anonymous";
                    return `[Function ${name}]`;
                }
                if (typeof v === "object" && v !== null) {
                    if (seen.has(v as object)) return "[Circular]";
                    seen.add(v as object);
                }
                return v;
            },
            2,
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `<<unserializable: ${msg}>>`;
    }

    if (serialized.length <= maxChars) return serialized;
    return `${serialized.slice(0, maxChars)}\n<<truncated ${serialized.length - maxChars} chars>>`;
}

function getStageSnapshot(stage: unknown) {
    const s = stage as any;
    return {
        environment: s?.environment ?? null,
        users: s?.users ?? null,
        characters: s?.characters ?? null,
        config: s?.config ?? null,
        effectiveConfig: s?._effectiveConfig ?? null,
        defaultConfig: s?.defaultConfig ?? null,
        messageState: s?.myInternalState ?? null,
        chatState: s?._chatState ?? null,
    };
}

export function DeveloperUI({stage}: DeveloperUIProps) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => setTick((t) => t + 1), 500);
        return () => window.clearInterval(id);
    }, []);

    const snapshot = useMemo(() => getStageSnapshot(stage), [stage, tick]);

    return (
        <div className="devUiPanel" role="dialog" aria-label="Developer UI">
            <div className="devUiPanelHeader">
                <div className="devUiTitle">Developer UI (read-only)</div>
                <div className="devUiSubtitle">Auto-refresh: 500ms</div>
            </div>

            <div className="devUiSection">
                <div className="devUiSectionTitle">Effective config</div>
                <pre className="devUiPre">{safeStringify(snapshot.effectiveConfig)}</pre>
            </div>

            <div className="devUiSection">
                <div className="devUiSectionTitle">Message state</div>
                <pre className="devUiPre">{safeStringify(snapshot.messageState)}</pre>
            </div>

            <div className="devUiSection">
                <div className="devUiSectionTitle">Chat state</div>
                <pre className="devUiPre">{safeStringify(snapshot.chatState)}</pre>
            </div>

            <div className="devUiSection">
                <div className="devUiSectionTitle">Init context</div>
                <pre className="devUiPre">{safeStringify({
                    environment: snapshot.environment,
                    users: snapshot.users,
                    characters: snapshot.characters,
                    config: snapshot.config,
                    defaultConfig: snapshot.defaultConfig,
                })}</pre>
            </div>
        </div>
    );
}
