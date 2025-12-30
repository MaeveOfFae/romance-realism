import {useEffect, useState} from "react";
import {DEFAULT_INITIAL, StageBase, InitialData} from "@chub-ai/stages-ts";
import {DeveloperUI} from "./DeveloperUI";

// Modify this JSON to include whatever character/user information you want to test.
import InitData from './assets/test-init.json';

export interface TestStageRunnerProps<StageType extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType>, InitStateType, ChatStateType, MessageStateType, ConfigType> {
    factory: (data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) => StageType;
}

/***
 This is a testing class for running a stage locally when testing,
    outside the context of an active chat. See runTests() below for the main idea.
 ***/
export const TestStageRunner = <StageType extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType>,
    InitStateType, ChatStateType, MessageStateType, ConfigType>({ factory }: TestStageRunnerProps<StageType, InitStateType, ChatStateType, MessageStateType, ConfigType>) => {

    const [stage] = useState(() => factory({...DEFAULT_INITIAL, ...(InitData as any)}));

    // This is what forces the stage node to re-render.
    const [node, setNode] = useState(new Date());

    const STORAGE_KEY = "romance-realism:showDeveloperUi";
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showDeveloperUi, setShowDeveloperUi] = useState<boolean>(() => {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });
    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, showDeveloperUi ? "1" : "0");
        } catch {
            // ignore
        }
    }, [showDeveloperUi]);

    function _refresh() {
        setNode(new Date());
    }

    async function _delayedTest(test: any, delaySeconds: number) {
        await new Promise(f => setTimeout(f, delaySeconds * 1000));
        return test();
    }

    /***
     This is the main thing you'll want to modify.
     ***/
    async function runTests() {
        /*
        await stage.setState({someKey: 'A new value, even!'});
        refresh();

        const beforePromptResponse: Partial<StageResponse<ChatStateType, MessageStateType>> = await stage.beforePrompt({
            ...DEFAULT_MESSAGE, ...{
                anonymizedId: "0",
                content: "Hello, this is what happens when a human sends a message, but before it's sent to the model.",
                isBot: false
            }
        });
        console.assert(beforePromptResponse.error == null);
        refresh();
        */
        /***
         "What is all of this nonsense with 'DEFAULT_MESSAGE'?" you may well ask.
         The purpose of this is to future-proof your test runner.
         The stage interface is designed to be forwards-compatible,
            so that a stage with a certain library version will continue to work
            even if new fields are added to any of the call/response objects.
         But when new fields are added to the input objects, the code calling an
            stage needs to be updated. Using DEFAULT_MESSAGE,
            DEFAULT_INITIAL, DEFAULT_CHARACTER, DEFAULT_USER,
            DEFAULT_LOAD_RESPONSE, and DEFAULT_RESPONSE
            where relevant in your tests prevents a version bump
            from breaking your test runner in many cases.
         ***/
        /*
        const afterPromptResponse: Partial<StageResponse<ChatStateType, MessageStateType>> = await stage.afterResponse({
            ...DEFAULT_MESSAGE, ...{
            promptForId: null,
            anonymizedId: "2",
            content: "Why yes hello, and this is what happens when a bot sends a response.",
            isBot: true}});
        console.assert(afterPromptResponse.error == null);
        refresh();

        const afterDelayedThing: Partial<StageResponse<ChatStateType, MessageStateType>> = await delayedTest(() => stage.beforePrompt({
            ...DEFAULT_MESSAGE, ...{
            anonymizedId: "0", content: "Hello, and now the human is prompting again.", isBot: false, promptForId: null
        }}), 5);
        console.assert(afterDelayedThing.error == null);
        refresh();
        */
    }

    useEffect(() => {
        // Always do this first, and put any other calls inside the load response.
        stage.load().then((res) => {
            console.info(`Test StageBase Runner load success result was ${res.success}`);
            if(!res.success || res.error != null) {
                console.error(`Error from stage during load, error: ${res.error}`);
            } else {
                runTests().then(() => console.info("Done running tests."));
            }
        });
    }, []);

    return <>
        <div style={{display: 'none'}}>{String(node)}{window.location.href}</div>
        <div className="devUiRoot">
            <button
                className="devUiButton"
                type="button"
                aria-label="Open settings"
                onClick={() => setSettingsOpen((v) => !v)}
            >
                ⚙
            </button>
            {settingsOpen && (
                <div className="devUiMenu" role="menu" aria-label="Settings menu">
                    <label className="devUiMenuItem">
                        <input
                            type="checkbox"
                            checked={showDeveloperUi}
                            onChange={(e) => setShowDeveloperUi(e.target.checked)}
                        />
                        <span>Show Developer UI</span>
                    </label>
                </div>
            )}
            {showDeveloperUi && <DeveloperUI stage={stage} />}
        </div>
        {stage == null ? <div>Stage loading...</div> : stage.render()}
    </>;
}
