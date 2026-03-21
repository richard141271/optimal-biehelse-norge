import { ImageResponse } from "next/og"
import React from "react"

export const runtime = "edge"

export async function GET() {
  const element = React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #F6C24A 0%, #174B2C 100%)",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          width: 152,
          height: 152,
          borderRadius: 40,
          background: "rgba(255, 255, 255, 0.92)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: "#0B0F0E",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        },
      },
      React.createElement(
        "div",
        { style: { fontSize: 52, fontWeight: 800, letterSpacing: -1 } },
        "OBNO"
      ),
      React.createElement(
        "div",
        { style: { fontSize: 18, fontWeight: 600, opacity: 0.9 } },
        "Biehelse"
      )
    )
  )

  return new ImageResponse(
    element,
    { width: 192, height: 192 }
  )
}
