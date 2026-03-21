export const runtime = "edge"

export async function GET() {
  const icon = await fetch(new URL("./icon-512.png", import.meta.url)).then(
    (r) => r.arrayBuffer()
  )

  return new Response(icon, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  })
}
