"use client";

const ITEMS = ["💀", "🐈", "🕶️", "🔥", "🗺️", "🧢", "🤡", "🫡", "📉", "✡️", "🌀", "😭"];

// Decorative emoji drifting up the desktop margins. Hidden on phones and for
// reduced-motion users (see globals.css).
export function FloatingMemes() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden 2xl:block" aria-hidden>
      {ITEMS.map((e, i) => (
        <span
          key={i}
          className="float-meme absolute bottom-[-60px] text-3xl"
          style={{
            left: i % 2 ? `${2 + (i * 3) % 9}%` : `${88 + (i * 5) % 9}%`,
            animationDuration: `${18 + (i * 7) % 16}s`,
            animationDelay: `${-i * 3.1}s`,
          }}
        >
          {e}
        </span>
      ))}
    </div>
  );
}
