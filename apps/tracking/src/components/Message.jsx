/** Full-page message for missing, expired or failed tracking links. */
export default function Message({ title, children }) {
  return (
    <main className="message">
      <div className="message__card">
        <p className="brand">SafeWalk</p>
        <h1>{title}</h1>
        <p className="sw-muted">{children}</p>
      </div>
    </main>
  );
}
