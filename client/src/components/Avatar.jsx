const COLORS = ['#2563eb', '#16a34a', '#c026d3', '#ea580c', '#0891b2'];

export default function Avatar({ name, size = 'md' }) {
  const color = COLORS[(name.charCodeAt(0) || 0) % COLORS.length];
  return <span className={`avatar ${size}`} style={{ background: color }} aria-hidden="true">{name[0]}</span>;
}
