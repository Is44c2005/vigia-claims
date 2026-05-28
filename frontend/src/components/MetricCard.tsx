interface MetricCardProps {
  title:   string;
  value:   string | number;
  sub?:    string;
  color?:  "rojo" | "amarillo" | "verde" | "blue";
}

const colorMap = {
  rojo:     "text-rojo",
  amarillo: "text-amarillo",
  verde:    "text-verde",
  blue:     "text-accent",
};

export default function MetricCard({ title, value, sub, color = "blue" }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-surface to-[#1a1a2e] border border-surface2 p-5 text-center hover:-translate-y-0.5 transition-transform">
      <p className="text-accent text-xs font-semibold uppercase tracking-widest mb-2">{title}</p>
      <p className={`text-4xl font-extrabold my-2 ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-[#666] text-xs">{sub}</p>}
    </div>
  );
}
