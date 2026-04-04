"use client";

import dynamic from "next/dynamic";

const ShieldScene = dynamic(() => import("./ShieldScene"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "480px",
        background: "linear-gradient(135deg, #0d1b2e, #0f2040)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(162,203,239,0.35)",
        fontSize: "0.8rem",
        fontFamily: "sans-serif",
        letterSpacing: "0.1em",
      }}
    >
      INITIALIZING...
    </div>
  ),
});

export default function ShieldSceneWrapper() {
  return <ShieldScene />;
}
