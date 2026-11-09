import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import '@safewalk/shared/styles/tokens.css';
import '@safewalk/shared/styles/base.css';
import '@safewalk/shared/styles/ui.css';
import './styles.css';
import TrackingPage from './TrackingPage.jsx';
import Message from './components/Message.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/t/:token" element={<TrackingPage />} />
        <Route
          path="*"
          element={
            <Message title="Open the link you were sent">
              SafeWalk journey links look like <code>/t/…</code>. Ask the person who shared it to send it again.
            </Message>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
