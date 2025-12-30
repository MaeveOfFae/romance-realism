import React, {useEffect, useState} from "react";
import {DEFAULT_INITIAL, DEFAULT_LOAD_RESPONSE, DEFAULT_RESPONSE} from "@chub-ai/stages-ts";

const INIT = 'INIT';
const BEFORE = 'BEFORE';
const AFTER = 'AFTER';
const SET = 'SET';
const CALL = 'CALL';
const MESSAGE_TYPES = new Set([INIT, BEFORE, AFTER, SET]);

export type SafeRunnerProps = {
    factory: (data: any) => any;
    debug?: boolean;
};

export const SafeRunner = ({factory, debug = false}: SafeRunnerProps) => {
    const [stage, setStage] = useState<any>(null);
    const [node, setNode] = useState(new Date());
    const [previous, setPrevious] = useState<{key: string | null; value: any}>({key: null, value: {}});

    // Only dedupe INIT; other message types should always run to avoid skipping auto-responses.
    function safeKey(messageType: string, data: any): string | null {
        if (messageType !== INIT) return null;
        try {
            return messageType + ': ' + JSON.stringify(data);
        } catch {
            return null;
        }
    }

    function sendMessage(messageType: string, message: any) {
        window.parent.postMessage({messageType, data: message}, '*');
    }

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            try {
                if (event.source !== window.parent) return;
                if (event.data == null || typeof event.data !== 'object') return;

                const {messageType, data} = event.data as any;
                if (debug && MESSAGE_TYPES.has(messageType)) {
                    console.debug('Stage iFrame received event:', {origin: event.origin, messageType, data});
                }

                const answerKey = safeKey(messageType, data);
                const canUseCache = answerKey != null && previous.key === answerKey;
                if (canUseCache) {
                    if (debug) console.debug('Stage iFrame: returning cached response');
                    sendMessage(messageType, previous.value);
                    return;
                }

                if (messageType === INIT) {
                    if (stage != null) {
                        const response = {...DEFAULT_LOAD_RESPONSE};
                        if (answerKey) setPrevious({key: answerKey, value: response});
                        sendMessage(INIT, response);
                        return;
                    }
                    try {
                        const newStage = factory({...DEFAULT_INITIAL, ...data});
                        const loadResult = await newStage.load();
                        const response = {...DEFAULT_LOAD_RESPONSE, ...loadResult};
                        if (answerKey) setPrevious({key: answerKey, value: response});
                        sendMessage(INIT, response);
                        setStage(newStage);
                        return;
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error('Stage INIT error:', e);
                        const response = {...DEFAULT_LOAD_RESPONSE, success: false, error: msg};
                        if (answerKey) setPrevious({key: answerKey, value: response});
                        sendMessage(INIT, response);
                        return;
                    }
                }

                if (stage == null) {
                    if (debug) console.debug('Stage iFrame: message received before INIT', messageType);
                    const response = {...DEFAULT_RESPONSE, error: 'Stage not initialized.'};
                    sendMessage(messageType, response);
                    return;
                }

                if (messageType === BEFORE) {
                    const beforeResponse = await stage.beforePrompt({...data});
                    const response = {...DEFAULT_RESPONSE, ...beforeResponse};
                    sendMessage(BEFORE, response);
                    return;
                }

                if (messageType === AFTER) {
                    const afterResponse = await stage.afterResponse({...data});
                    const response = {...DEFAULT_RESPONSE, ...afterResponse};
                    sendMessage(AFTER, response);
                    return;
                }

                if (messageType === SET) {
                    await stage.setState(data);
                    sendMessage(SET, {});
                    return;
                }

                if (messageType === CALL) {
                    const {functionName, parameters} = data || {};
                    if (stage != null && Object.prototype.hasOwnProperty.call(stage, functionName)) {
                        const result = stage[functionName](parameters);
                        sendMessage(CALL, {functionName, result});
                    } else {
                        sendMessage(CALL, {functionName, result: null});
                    }
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error('Stage iFrame message handler error:', e);
                try {
                    window.parent.postMessage({
                        messageType: 'ERROR',
                        data: {name: e instanceof Error ? e.name : 'Error', message: msg},
                    }, '*');
                } catch {
                    // ignore
                }
            } finally {
                setNode(new Date());
            }
        };

        window.removeEventListener('message', handleMessage as any);
        window.addEventListener('message', handleMessage as any);
        return () => window.removeEventListener('message', handleMessage as any);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, previous.key]);

    return (
        <>
            <div style={{display: 'none'}}>{String(node)}{window.location.href}</div>
            {stage == null ? null : stage.render()}
        </>
    );
};
