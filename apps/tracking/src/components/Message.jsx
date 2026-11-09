/** Full-page message for missing, expired or failed tracking links. */
export default function Message({ title, children }) {
  return (
    <main className="message">
      <div className="message__card glass">
        <span className="wordmark">SafeWalk</span>
        <h1>{title}</h1>
        <p className="muted">{children}</p>
      </div>
    </main>
  );
}
