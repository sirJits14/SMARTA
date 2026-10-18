import { useEffect, useRef } from 'react';

// Ten seconds to undo a flag; plain confirmations leave sooner.
export default function UndoToast({ message, onUndo, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => done.current(), onUndo ? 10000 : 4000);
    return () => clearTimeout(id);
  }, [message, onUndo]);
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {onUndo && <button type="button" onClick={onUndo}>Undo</button>}
    </div>
  );
}
