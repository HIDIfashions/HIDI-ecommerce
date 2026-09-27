import { notFound } from "next/navigation";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function MenuLayoutCheck() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const sizes = [[320, 568], [390, 844], [412, 740]];
  return (
    <section aria-label="Responsive menu verification" style={{
      position: "fixed", inset: 0, zIndex: 2147483647,
      background: "#e8e8e8", color: "#222", overflow: "auto",
      padding: 16, display: "flex", gap: 16, alignItems: "flex-start"
    }}>
      {sizes.map(([width, height]) => (
        <div key={width} style={{ flex: "0 0 auto" }}>
          <p style={{ margin: "0 0 8px", font: "14px sans-serif" }}>{width} × {height}</p>
          <iframe title={`Storefront at ${width}px`} src="/"
            width={width} height={height}
            style={{ width, height, border: "1px solid #aaa", display: "block" }} />
        </div>
      ))}
    </section>
  );
}
