import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import JourneyMap from './components/JourneyMap.jsx';
import Message from './components/Message.jsx';
import SosPanel from './components/SosPanel.jsx';
import StatusPanel from './components/StatusPanel.jsx';
import { useTrackingSession } from './useTrackingSession.js';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function TrackingPage() {
  const { token } = useParams();
  const { view, error, connection } = useTrackingSession(token);
  const now = useNow();

  useEffect(() => {
    if (view) document.title = `${view.traveller_name} · SafeWalk`;
  }, [view]);

  if (error?.code === 'LINK_EXPIRED') {
    return (
      <Message title="This tracking link has expired">
        The journey ended and the link is no longer active. Contact the person directly if you need to check on them.
      </Message>
    );
  }
  if (error?.code === 'NOT_FOUND') {
    return <Message title="Journey not found">This link is not valid. Check that you opened the full link you were sent.</Message>;
  }
  if (error && !view) {
    return <Message title="Unable to load the journey">{error.message}</Message>;
  }
  if (!view) {
    return (
      <main className="message" aria-busy="true">
        <p className="muted">Loading the journey</p>
      </main>
    );
  }

  return (
    <main className="layout">
      <JourneyMap view={view} />
      {view.kind === 'SOS' ? (
        <SosPanel view={view} now={now} connection={connection} />
      ) : (
        <StatusPanel view={view} now={now} connection={connection} />
      )}
    </main>
  );
}
