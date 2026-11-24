"use client"

import { useEffect, useState } from "react"

type Props = {
  innhold: string
}

export function ButikkpartnerAvtale({ innhold }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  const hasContent = innhold.trim().length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasContent}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Les Butikkpartneravtalen
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b bg-background/95 px-5 py-3 backdrop-blur">
              <h2 className="text-lg font-semibold tracking-tight">
                Butikkpartneravtale
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Lukk"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[calc(85vh-3.5rem)] overflow-y-auto px-5 py-5">
              {hasContent ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {innhold}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Avtalen er ikke lagt til ennå.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
