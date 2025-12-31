export type Message = {content?: string; [key: string]: unknown};

export type StageResponse<ChatState = unknown, MessageState = unknown> = {
    stageDirections: unknown;
    messageState: MessageState;
    state?: MessageState;
    modifiedMessage: unknown;
    systemMessage: string | null;
    error: string | null;
    chatState: ChatState | null;
};

export type InitialData<InitState = unknown, ChatState = unknown, MessageState = unknown, Config = unknown> = {
    environment?: unknown;
    users?: Record<string, unknown>;
    characters?: Record<string, unknown>;
    config?: Config;
    initState?: InitState | null;
    chatState?: ChatState | null;
    messageState?: MessageState | null;
};

export class StageBase<InitState = unknown, ChatState = unknown, MessageState = unknown, Config = unknown> {
    environment: unknown;
    users: Record<string, unknown>;
    characters: Record<string, unknown>;
    config: Config;
    initState: InitState | null;
    chatState: ChatState | null;
    messageState: MessageState | null;

    constructor(data: InitialData<InitState, ChatState, MessageState, Config>) {
        this.environment = data.environment ?? null;
        this.users = data.users ?? {};
        this.characters = data.characters ?? {};
        this.config = (data.config ?? {}) as Config;
        this.initState = (data.initState ?? null) as InitState | null;
        this.chatState = (data.chatState ?? null) as ChatState | null;
        this.messageState = (data.messageState ?? null) as MessageState | null;
    }

    async load(): Promise<any> {
        return {success: true, error: null};
    }

    async beforePrompt(_userMessage: Message): Promise<any> {
        return {};
    }

    async afterResponse(_botMessage: Message): Promise<any> {
        return {};
    }

    async setState(_state: MessageState): Promise<void> {}

    render(): any {
        return null;
    }
}

export const DEFAULT_INITIAL: InitialData = {
    environment: null,
    users: {},
    characters: {},
    config: {},
    initState: null,
    chatState: null,
    messageState: null,
};

export const DEFAULT_LOAD_RESPONSE = {
    success: true,
    error: null,
    initState: null,
    chatState: null,
    messageState: null,
    state: null,
};

export const DEFAULT_RESPONSE = {
    stageDirections: null,
    messageState: null,
    state: null,
    modifiedMessage: null,
    systemMessage: null,
    error: null,
    chatState: null,
};

export const ReactRunner: any = () => null;

export default {
    StageBase,
};
