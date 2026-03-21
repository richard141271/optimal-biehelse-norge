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
          width: 420,
          height: 420,
          borderRadius: 120,
          background: "rgba(255, 255, 255, 0.92)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: "#0B0F0E",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        },
      },
      React.createElement(
        "div",
        { style: { fontSize: 132, fontWeight: 800, letterSpacing: -3 } },
        "OBNO"
      ),
      React.createElement(
        "div",
        { style: { fontSize: 44, fontWeight: 600, opacity: 0.9 } },
        "Optimal Biehelse"
      )
    )
  )

  return new ImageResponse(element, { width: 512, height: 512 })
}
