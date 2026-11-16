export default function Dashboard({ user }) {
  return (
    <div className="dashboard">
      <h2>Welcome, {user.name}</h2>
      <section>
        <h3>My documents</h3>
        <p className="muted empty">No documents yet.</p>
      </section>
      <section>
        <h3>Shared with me</h3>
        <p className="muted empty">Nothing has been shared with you yet.</p>
      </section>
    </div>
  );
}
