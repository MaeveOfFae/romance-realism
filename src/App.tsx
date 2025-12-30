import {ReactRunner} from "@chub-ai/stages-ts";
import {Stage} from "./Stage";
import {TestStageRunner} from "./TestRunner";
import {Playground} from "./Playground";

function App() {
  const isDev = import.meta.env.MODE === 'development';
  console.info(`Running in ${import.meta.env.MODE}`);

  if (isDev) {
    return (
      <div className="app-shell">
        <div className="app-pane">
          <TestStageRunner factory={(data: any) => new Stage(data)} />
        </div>
        <div className="app-pane demo-pane">
          <Playground />
        </div>
      </div>
    );
  }

  return <ReactRunner factory={(data: any) => new Stage(data)} />;
}

export default App
