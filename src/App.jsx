import { useState } from 'react';
import Sidebar from './components/Sidebar';
import MarkdownEditor from './components/MarkdownEditor';
import OnboardingModal from './components/OnboardingModal';
import useNotesStore from './store/notesStore';

function App() {
  const items = useNotesStore((state) => state.items);
  const [view, setView] = useState('editor');

  const showOnboarding = items.length === 0;

  return (
    <div className="h-screen flex flex-col bg-editor-bg text-white">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar onSettingsClick={() => setView('settings')} />
        <div className="flex-1 flex flex-col">
          {view === 'editor' ? (
            <MarkdownEditor />
          ) : (
            <div className="flex-1 p-8">
              <h1 className="text-2xl font-bold mb-4">Settings</h1>
              <button
                onClick={() => setView('editor')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Back to Editor
              </button>
            </div>
          )}
        </div>
      </div>
      {showOnboarding && <OnboardingModal />}
    </div>
  );
}

export default App;