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

                if (messageType === INIT) {
                    try {
                        // Always create a fresh stage on INIT to avoid stale state across replays.
                        const newStage = factory({...DEFAULT_INITIAL, ...data});
                        const loadResult = await newStage.load();
                        const response = {
                            ...DEFAULT_LOAD_RESPONSE,
                            ...loadResult,
                            state: (loadResult as any)?.state ?? (newStage as any)?.myInternalState ?? null,
                            messageState: loadResult?.messageState ?? newStage?.myInternalState ?? null,
                            chatState: loadResult?.chatState ?? (newStage as any)?._chatState ?? null,
                        };
                        sendMessage(INIT, response);
                        setStage(newStage);
                        return;
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error('Stage INIT error:', e);
                        const response = {...DEFAULT_LOAD_RESPONSE, success: false, error: msg};
                        sendMessage(INIT, response);
                        return;
                    }
                }

                if (stage == null) {
                    if (debug) console.debug('Stage iFrame: message received before INIT', messageType);
                    const response = {...DEFAULT_RESPONSE, error: 'Stage not initialized.'};
                    sendMessage(messageType, response); // no caching — always respond
                    return;
                }

                if (messageType === BEFORE) {
                    try {
                        const beforeResponse = await stage.beforePrompt({...data});
                        const response = {
                            ...DEFAULT_RESPONSE,
                            ...beforeResponse,
                            state: beforeResponse && (beforeResponse as any).state != null
                                ? (beforeResponse as any).state
                                : stage?.myInternalState ?? null,
                            messageState: (beforeResponse && beforeResponse.messageState != null)
                                ? beforeResponse.messageState
                                : stage?.myInternalState ?? null,
                            chatState: (beforeResponse && beforeResponse.chatState != null)
                                ? beforeResponse.chatState
                                : stage?._chatState ?? null,
                        };
                        sendMessage(BEFORE, response); // no caching — avoid skipping auto-responses
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error('Stage BEFORE error:', e);
                        const response = {
                            ...DEFAULT_RESPONSE,
                            error: `Stage error (before): ${msg}`,
                            // provide latest known state so host can continue
                            state: stage?.myInternalState ?? null,
                            messageState: stage?.myInternalState ?? null,
                            chatState: stage?._chatState ?? null,
                        };
                        sendMessage(BEFORE, response);
                    }
                    return;
                }

                if (messageType === AFTER) {
                    try {
                        const afterResponse = await stage.afterResponse({...data});
                        const response = {
                            ...DEFAULT_RESPONSE,
                            ...afterResponse,
                            state: afterResponse && (afterResponse as any).state != null
                                ? (afterResponse as any).state
                                : stage?.myInternalState ?? null,
                            messageState: (afterResponse && afterResponse.messageState != null)
                                ? afterResponse.messageState
                                : stage?.myInternalState ?? null,
                            chatState: (afterResponse && afterResponse.chatState != null)
                                ? afterResponse.chatState
                                : stage?._chatState ?? null,
                        };
                        sendMessage(AFTER, response); // no caching — avoid skipping auto-responses
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error('Stage AFTER error:', e);
                        const response = {
                            ...DEFAULT_RESPONSE,
                            error: `Stage error (after): ${msg}`,
                            state: stage?.myInternalState ?? null,
                            messageState: stage?.myInternalState ?? null,
                            chatState: stage?._chatState ?? null,
                        };
                        sendMessage(AFTER, response);
                    }
                    return;
                }

                if (messageType === SET) {
                    try {
                        await stage.setState(data);
                        sendMessage(SET, {
                            state: stage?.myInternalState ?? null,
                            messageState: stage?.myInternalState ?? null,
                            chatState: stage?._chatState ?? null,
                        }); // no caching — always acknowledge
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error('Stage SET error:', e);
                        sendMessage(SET, {
                            error: `Stage error (set): ${msg}`,
                            state: stage?.myInternalState ?? null,
                            messageState: stage?.myInternalState ?? null,
                            chatState: stage?._chatState ?? null,
                        });
                    }
                    return;
                }

                if (messageType === CALL) {
                    const {functionName, parameters} = data || {};
                    try {
                        if (stage != null && Object.prototype.hasOwnProperty.call(stage, functionName)) {
                            const result = stage[functionName](parameters);
                            sendMessage(CALL, {functionName, result});
                        } else {
                            sendMessage(CALL, {functionName, result: null});
                        }
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error('Stage CALL error:', e);
                        sendMessage(CALL, {functionName, result: null, error: `Stage error (call): ${msg}`});
                    }
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error('Stage iFrame message handler error:', e);
                // Never block the host; surface error as a log only.
            } finally {
                setNode(new Date());
            }
        };

        window.removeEventListener('message', handleMessage as any);
        window.addEventListener('message', handleMessage as any);
        return () => window.removeEventListener('message', handleMessage as any);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage]);

    return (
        <>
            <div style={{display: 'none'}}>{String(node)}{window.location.href}</div>
            {stage == null ? null : stage.render()}
        </>
    );
};
