"use client"

import * as React from "react"
import gsap from "gsap"

/*
 * Sneaker Product Hero — a product-detail section for one shoe in several
 * colourways. Name and copy on the left, the shoe floating in the middle, and
 * the buy column on the right: sizes, rating, price, colour swatches, add to
 * cart and a like button.
 *
 * - A swatch swaps the colourway: the shoe on show tilts up and out through the
 *   top while the new one rises in from below, the backdrop washes into the
 *   colourway's tint and its name slides by, huge, behind the shoe.
 * - A size re-prices the shoe and swaps its rating and review count; the
 *   numbers roll to their new values.
 * - The thumbnails and the "+N" chip open a gallery of every view.
 * - The heart pops, throws a handful of small hearts and says it was saved.
 * - Add to cart spins, ticks "Added" and drops a toast naming colour and size.
 * - The shoe tilts towards the pointer over a glossy reflection, a light sweep
 *   crosses it on every colour change, and holding the pointer on it opens a
 *   magnifying loupe. Stock is tracked per size and per colour.
 *
 * GSAP drives the motion; the shoe idles on a slow float. With reduced motion
 * everything changes in place and nothing floats, tilts or sweeps.
 *
 * Local additions: `labels` translates the visible UI text (English by
 * default) and `showReviews` hides the rating row.
 */

// Per-size stock. A mapped type, not Record<>: 21st's tokenizer stalls on runs of generics.
export type StockBySize = { [size: string]: number }

export type SneakerView = {
  src: string
  /** Shown in the gallery, e.g. "Heel". */
  label?: string
  /** Point to zoom on, as fractions of the image (0–1). Default the centre. */
  focus?: [number, number]
  /** 1 shows the whole image. Default 1. */
  zoom?: number
  /** Mirror it, for the other side of the shoe. */
  mirror?: boolean
}

export type SneakerVariant = {
  /** Colour name: the swatch label, the alt text and the word behind the shoe. */
  name: string
  /** Any CSS colour for the swatch. */
  swatch: string
  /** The backdrop's tint for this colourway. Defaults to `swatch`. */
  tint?: string
  /** The shoe in side profile, toe to the left, on a transparent background. */
  src: string
  /**
   * Every photo of this colourway. The first three are the thumbnails, the rest
   * are counted on the "+N" chip. Defaults to seven framings of `src`.
   */
  gallery?: SneakerView[]
  /** Size labels this colourway is sold out in. */
  soldOut?: string[]
  /** Stock per size label for this colourway; overrides the size's own. */
  stock?: StockBySize
}

export type SneakerSize = {
  label: string
  soldOut?: boolean
  /** Price in this size. Defaults to the `price` prop. */
  price?: number
  /** Stars out of five, fractions allowed. Defaults to the `rating` prop. */
  rating?: number
  /** Number of reviews. Defaults to the `reviews` prop. */
  reviews?: number
  /** Pairs left. 0 means sold out. */
  stock?: number
}

/** Visible UI text. Every field is optional; English is the default. */
export type SneakerLabels = {
  size: string
  reviews: string
  price: string
  colour: string
  addToCart: string
  soldOutCta: string
  added: string
  soldOutColour: string
  onlyLeft: (count: number, size: string) => string
  inStock: string
  saved: string
  removed: string
  holdToZoom: string
  tapToView: string
  /** The note in the toast after adding, e.g. "Cloud · size 37". */
  toastNote: (variant: string, size: string) => string
}

const DEFAULT_LABELS: SneakerLabels = {
  size: "SIZE",
  reviews: "REVIEWS",
  price: "PRICE",
  colour: "COLOUR",
  addToCart: "ADD TO CART",
  soldOutCta: "SOLD OUT",
  added: "ADDED",
  soldOutColour: "Sold out in this colour",
  onlyLeft: (n, s) => `Only ${n} left in size ${s}`,
  inStock: "In stock · ships in 2 days",
  saved: "Saved to favourites",
  removed: "Removed from favourites",
  holdToZoom: "Hold to zoom",
  tapToView: "Tap to view",
  toastNote: (v, s) => `${v} · size ${s}`,
}

export type SneakerProductHeroProps = {
  variants: SneakerVariant[]
  /** Index of the colourway shown first. */
  defaultVariant?: number
  eyebrow?: string
  title?: string
  description?: string
  sizes?: SneakerSize[]
  price?: number
  rating?: number
  reviews?: number
  /** Put before the price. */
  currency?: string
  /** At or below this many pairs, the stock line warns "Only N left". */
  lowStock?: number
  toast?: string
  /** Colour of a liked heart and its burst. */
  likeColor?: string
  onAddToCart?: (info: { variant: SneakerVariant; size: string; price: number }) => void
  onLikeChange?: (liked: boolean) => void
  /** Any CSS length. The section is at least this tall. Default 100svh. */
  height?: number | string
  /** Visible UI text, merged over the English defaults. */
  labels?: Partial<SneakerLabels>
  /** Formats a price for display. Default: `currency` + the whole number. */
  formatPrice?: (price: number) => string
  /** Show the stars and review count. Default true. */
  showReviews?: boolean
  className?: string
  style?: React.CSSProperties
}

const STAR = "M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"
const HEART =
  "M12 20.3l-1.4-1.3C5.4 14.3 2 11.2 2 7.4 2 4.4 4.4 2 7.4 2c1.7 0 3.4.8 4.6 2.1C13.2 2.8 14.9 2 16.6 2 19.6 2 22 4.4 22 7.4c0 3.8-3.4 6.9-8.6 11.6z"

// Seven framings of one side-profile photo, toe left: the gallery a shoe gets
// when it has no photos of its own. Focus points sit on that layout.
const FRAMINGS: Omit<SneakerView, "src">[] = [
  { label: "Side" },
  { label: "Inside", mirror: true },
  { label: "Heel", focus: [0.86, 0.42], zoom: 1.8 },
  { label: "Toe box", focus: [0.16, 0.6], zoom: 1.8 },
  { label: "Laces", focus: [0.47, 0.34], zoom: 1.8 },
  { label: "Midsole", focus: [0.45, 0.74], zoom: 1.7 },
  { label: "Collar", focus: [0.74, 0.32], zoom: 1.9 },
]

// #region logic
/** Background position that puts image point `f` (0–1) mid-box at zoom `z`. */
export function focusPosition(f: number, z: number) {
  if (z <= 1) return 50
  const p = (f * z - 0.5) / (z - 1)
  return Math.round(Math.min(1, Math.max(0, p)) * 1000) / 10
}

/** Price, rating and review count for a size, falling back to the defaults. */
export function sizeStats(
  size: { price?: number; rating?: number; reviews?: number } | undefined,
  base: { price: number; rating: number; reviews: number },
) {
  return {
    price: size?.price ?? base.price,
    rating: Math.min(5, Math.max(0, size?.rating ?? base.rating)),
    reviews: size?.reviews ?? base.reviews,
  }
}

/** Whether a size is sold out in a colourway, and how many pairs are left. */
export function availability(
  size: { label: string; soldOut?: boolean; stock?: number } | undefined,
  variant: { soldOut?: string[]; stock?: StockBySize } | undefined,
) {
  if (!size) return { soldOut: true, stock: 0 }
  const stock = variant?.stock?.[size.label] ?? size.stock
  const soldOut = !!size.soldOut || !!variant?.soldOut?.includes(size.label) || stock === 0
  return { soldOut, stock: soldOut ? 0 : stock }
}
// #endregion

/** Peak opacity of the floor reflection. */
const REFLECT = 0.24

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

function viewStyle(v: SneakerView): React.CSSProperties {
  const z = v.zoom ?? 1
  const [fx, fy] = v.focus ?? [0.5, 0.5]
  return {
    backgroundImage: `url("${v.src}")`,
    backgroundSize: z <= 1 ? "contain" : `${z * 100}% auto`,
    backgroundPosition: `${focusPosition(fx, z)}% ${focusPosition(fy, z)}%`,
    transform: v.mirror ? "scaleX(-1)" : undefined,
  }
}

function Stars({ value }: { value: number }) {
  const row = (fill: boolean) =>
    [0, 1, 2, 3, 4].map((i) => (
      <svg key={i} viewBox="0 0 20 20" aria-hidden="true">
        <path d={STAR} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ))
  return (
    <span className="snp-stars" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="snp-starrow">{row(false)}</span>
      <span className="snp-starrow snp-starfill" style={{ clipPath: `inset(0 ${100 - value * 20}% 0 0)` }}>
        {row(true)}
      </span>
    </span>
  )
}

export default function SneakerProductHero({
  variants,
  defaultVariant = 0,
  eyebrow = "Women's Racing Shoe",
  title = "Kestrel Vapor Pace 3",
  description = "The Vapor Pace 3 pairs a springy foam core with a featherweight knit, so it gives back on race day and still feels kind on an easy Tuesday jog.",
  sizes = [
    { label: "36", price: 240, rating: 4.2, reviews: 86, stock: 12 },
    { label: "37", price: 250, rating: 4.6, reviews: 142, stock: 3 },
    { label: "38", soldOut: true },
    { label: "39", price: 265, rating: 4.8, reviews: 59, stock: 8 },
  ],
  price = 250,
  rating = 4.5,
  reviews = 120,
  currency = "$",
  lowStock = 3,
  toast = "Shopping Cart Updated",
  likeColor = "#e11d48",
  onAddToCart,
  onLikeChange,
  height = "100svh",
  labels,
  formatPrice,
  showReviews = true,
  className,
  style,
}: SneakerProductHeroProps) {
  const L: SneakerLabels = { ...DEFAULT_LABELS, ...labels }
  const count = variants.length
  const [active, setActive] = React.useState(() => Math.min(Math.max(defaultVariant, 0), Math.max(count - 1, 0)))
  const avail = (vi: number, label: string) => availability(sizes.find((s) => s.label === label), variants[vi])
  const firstFree = (vi: number) => sizes.find((s) => !avail(vi, s.label).soldOut)?.label ?? ""
  const [size, setSize] = React.useState(() => firstFree(Math.min(Math.max(defaultVariant, 0), Math.max(count - 1, 0))))
  const [cart, setCart] = React.useState("idle" as "idle" | "busy" | "done")
  const cartTimers = React.useRef([] as number[])
  const [vZoom, setVZoom] = React.useState(false)
  const [hintSeen, setHintSeen] = React.useState(false)
  const [liked, setLiked] = React.useState(false)
  const [likeMsg, setLikeMsg] = React.useState("")
  const [toastNote, setToastNote] = React.useState("")
  const [viewer, setViewer] = React.useState(null as number | null)
  const [thumbSet, setThumbSet] = React.useState(active)

  const stats = sizeStats(
    sizes.find((s) => s.label === size),
    { price, rating, reviews },
  )

  const shoeRefs = React.useRef([] as (HTMLImageElement | null)[])
  const wordRefs = React.useRef([] as (HTMLSpanElement | null)[])
  const reflectRefs = React.useRef([] as (HTMLImageElement | null)[])
  const tiltRef = React.useRef(null as HTMLDivElement | null)
  const sheenRef = React.useRef(null as HTMLSpanElement | null)
  const shoeStageRef = React.useRef(null as HTMLDivElement | null)
  const loupeRef = React.useRef(null as HTMLSpanElement | null)
  const loupeImgRef = React.useRef(null as HTMLSpanElement | null)
  const holding = React.useRef(false)
  const lastPointer = React.useRef("mouse")
  const reflectWrapRef = React.useRef(null as HTMLDivElement | null)
  const floatRef = React.useRef(null as HTMLDivElement | null)
  const floorRef = React.useRef(null as HTMLSpanElement | null)
  const rootRef = React.useRef(null as HTMLElement | null)
  const thumbsRef = React.useRef(null as HTMLSpanElement | null)
  const priceRef = React.useRef(null as HTMLSpanElement | null)
  const countRef = React.useRef(null as HTMLSpanElement | null)
  const likeRef = React.useRef(null as HTMLButtonElement | null)
  const burstRef = React.useRef(null as HTMLSpanElement | null)
  const pillRef = React.useRef(null as HTMLSpanElement | null)
  const toastRef = React.useRef(null as HTMLDivElement | null)
  const toastTimer = React.useRef(null as gsap.core.Tween | null)
  const boxRef = React.useRef(null as HTMLDivElement | null)
  const closeRef = React.useRef(null as HTMLButtonElement | null)
  const opener = React.useRef(null as HTMLElement | null)
  const shown = React.useRef(active)
  // The numbers are rolled by hand; React renders their first values only.
  const first = React.useRef(stats)

  // Only the shoe and word on show are visible at first.
  React.useLayoutEffect(() => {
    shoeRefs.current.forEach((el, i) => el && gsap.set(el, { yPercent: 0, rotation: 0, autoAlpha: i === shown.current ? 1 : 0 }))
    wordRefs.current.forEach((el, i) => el && gsap.set(el, { yPercent: 0, autoAlpha: i === shown.current ? 1 : 0 }))
    reflectRefs.current.forEach((el, i) => el && gsap.set(el, { autoAlpha: i === shown.current ? REFLECT : 0 }))
  }, [count])

  // A slow float while the section is on screen.
  React.useEffect(() => {
    const wrap = floatRef.current
    const floor = floorRef.current
    const root = rootRef.current
    if (!wrap || !floor || !root || prefersReduced()) return
    const tl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: 2.6, ease: "sine.inOut" } })
    tl.to(wrap, { y: "-1.1cqw" }, 0).to(floor, { scaleX: 0.88, opacity: 0.65 }, 0)
    if (reflectWrapRef.current) tl.to(reflectWrapRef.current, { y: "1.1cqw" }, 0)
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? tl.resume() : tl.pause()))
    io.observe(root)
    return () => {
      io.disconnect()
      tl.kill()
    }
  }, [])

  React.useEffect(() => () => {
    toastTimer.current?.kill()
    cartTimers.current.forEach(clearTimeout)
  }, [])

  // The shoe leans towards a fine pointer; the glow and the shadow follow.
  React.useEffect(() => {
    const root = rootRef.current
    const tilt = tiltRef.current
    const floor = floorRef.current
    if (!root || !tilt || !floor || prefersReduced() || !window.matchMedia("(pointer: fine)").matches) return
    gsap.set(tilt, { transformPerspective: 1100 })
    const ry = gsap.quickTo(tilt, "rotationY", { duration: 0.8, ease: "power3.out" })
    const rx = gsap.quickTo(tilt, "rotationX", { duration: 0.8, ease: "power3.out" })
    const fx = gsap.quickTo(floor, "x", { duration: 0.9, ease: "power3.out" })
    const glow = { x: 0, y: 0 }
    const drift = (x: number, y: number) =>
      gsap.to(glow, {
        x,
        y,
        duration: 1,
        ease: "power3.out",
        overwrite: true,
        onUpdate: () => {
          root.style.setProperty("--mx", glow.x.toFixed(2) + "%")
          root.style.setProperty("--my", glow.y.toFixed(2) + "%")
        },
      })
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return
      const r = (shoeStageRef.current ?? root).getBoundingClientRect()
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1))
      const k = holding.current ? 0 : 1
      ry(nx * 12 * k)
      rx(-ny * 7 * k)
      fx(-nx * 14 * k)
      drift(nx * 8, ny * 6)
    }
    const onLeave = () => {
      ry(0)
      rx(0)
      fx(0)
      drift(0, 0)
    }
    root.addEventListener("pointermove", onMove)
    root.addEventListener("pointerleave", onLeave)
    return () => {
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerleave", onLeave)
      gsap.killTweensOf(glow)
    }
  }, [])

  // A band of light crosses the shoe: once on arrival, then on every colour.
  const sweep = (delay: number) => {
    const sh = sheenRef.current
    if (!sh || prefersReduced()) return
    gsap.fromTo(sh, { backgroundPosition: "130% 0%" }, { backgroundPosition: "-30% 0%", duration: 1.2, ease: "power2.inOut", delay })
  }
  React.useEffect(() => sweep(0.6), [])

  // Roll the price and review count when the size changes.
  const shownStats = React.useRef(stats)
  React.useEffect(() => {
    const from = shownStats.current
    shownStats.current = stats
    const p = priceRef.current
    const c = countRef.current
    if (!p) return
    const fmt = (n: number) => (formatPrice ? formatPrice(n) : currency + Math.round(n))
    if (prefersReduced()) {
      p.textContent = fmt(stats.price)
      if (c) c.textContent = `(${stats.reviews})`
      return
    }
    const o = { price: from.price, reviews: from.reviews }
    const tw = gsap.to(o, {
      price: stats.price,
      reviews: stats.reviews,
      duration: 0.6,
      ease: "power2.out",
      onUpdate: () => {
        p.textContent = fmt(o.price)
        if (c) c.textContent = `(${Math.round(o.reviews)})`
      },
    })
    if (from.price !== stats.price) gsap.fromTo(p, { y: stats.price > from.price ? 8 : -8, opacity: 0.4 }, { y: 0, opacity: 1, duration: 0.45, ease: "power2.out" })
    return () => {
      tw.kill()
    }
  }, [stats.price, stats.reviews, currency])

  const pick = (next: number) => {
    const prev = shown.current
    if (next === prev) return
    setActive(next)
    shown.current = next
    if (avail(next, size).soldOut) setSize(firstFree(next))
    const refl = reflectRefs.current
    const rm = prefersReduced()
    refl.forEach((el) => el && gsap.killTweensOf(el))
    if (refl[prev]) gsap.to(refl[prev], { autoAlpha: 0, duration: rm ? 0 : 0.25 })
    if (refl[next]) gsap.to(refl[next], { autoAlpha: REFLECT, duration: rm ? 0 : 0.6, delay: rm ? 0 : 0.45 })
    const reduce = prefersReduced()
    const shoes = shoeRefs.current
    const words = wordRefs.current
    ;[shoes, words].forEach((list) =>
      list.forEach((el, i) => {
        if (!el) return
        gsap.killTweensOf(el)
        if (i !== prev && i !== next) gsap.set(el, { autoAlpha: 0, yPercent: 0, rotation: 0 })
      }),
    )
    if (reduce) {
      ;[shoes, words].forEach((list) => {
        if (list[prev]) gsap.set(list[prev], { autoAlpha: 0, yPercent: 0, rotation: 0 })
        if (list[next]) gsap.set(list[next], { autoAlpha: 1, yPercent: 0, rotation: 0 })
      })
      setThumbSet(next)
      return
    }
    // From the reference: a ~0.4 s swap, the old shoe lifting out the top as
    // the new one rises from below, about 1.3 shoe-heights of travel.
    if (shoes[prev]) gsap.to(shoes[prev], { yPercent: -130, rotation: -7, autoAlpha: 0, duration: 0.45, ease: "power2.in" })
    if (shoes[next])
      gsap.fromTo(
        shoes[next],
        { yPercent: 130, rotation: 9, autoAlpha: 0 },
        { yPercent: 0, rotation: 0, autoAlpha: 1, duration: 0.7, ease: "back.out(1.3)", delay: 0.06 },
      )
    sweep(0.55)
    if (words[prev]) gsap.to(words[prev], { yPercent: -70, autoAlpha: 0, duration: 0.55, ease: "power2.in" })
    if (words[next]) gsap.fromTo(words[next], { yPercent: 70, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.9, ease: "power3.out", delay: 0.1 })
    const thumbs = thumbsRef.current
    if (thumbs)
      gsap.to(thumbs, {
        autoAlpha: 0,
        x: -8,
        duration: 0.16,
        ease: "power1.in",
        onComplete: () => {
          setThumbSet(next)
          gsap.fromTo(thumbs, { autoAlpha: 0, x: 8 }, { autoAlpha: 1, x: 0, duration: 0.3, ease: "power2.out" })
        },
      })
    else setThumbSet(next)
  }

  const like = () => {
    const next = !liked
    setLiked(next)
    setLikeMsg(next ? L.saved : L.removed)
    onLikeChange?.(next)
    const from = likeRef.current
    const pill = pillRef.current
    if (!from || !pill) return
    gsap.killTweensOf(pill)
    if (prefersReduced()) {
      gsap.set(pill, { autoAlpha: 1, y: 0 })
      gsap.to(pill, { autoAlpha: 0, duration: 0, delay: 1.6 })
      return
    }
    gsap
      .timeline()
      .fromTo(pill, { autoAlpha: 0, y: 6, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" })
      .to(pill, { autoAlpha: 0, y: -10, duration: 0.4, ease: "power2.in" }, "+=1.1")
    gsap.fromTo(from.firstElementChild, { scale: next ? 0.5 : 1.2 }, { scale: 1, duration: 0.55, ease: "back.out(3)" })
    const burst = burstRef.current
    if (!next || !burst) return
    Array.from(burst.children).forEach((h, i) => {
      const a = (-90 + (i - 3) * 26 + gsap.utils.random(-8, 8)) * (Math.PI / 180)
      const d = gsap.utils.random(26, 46)
      gsap.fromTo(
        h,
        { x: 0, y: 0, scale: 0.4, autoAlpha: 1, rotation: 0 },
        {
          x: Math.cos(a) * d,
          y: Math.sin(a) * d,
          scale: gsap.utils.random(0.6, 1),
          rotation: gsap.utils.random(-30, 30),
          autoAlpha: 0,
          duration: gsap.utils.random(0.6, 0.9),
          ease: "power2.out",
        },
      )
    })
  }

  const addToCart = () => {
    if (cart !== "idle" || avail(shown.current, size).soldOut) return
    const reduce = prefersReduced()
    const later = (ms: number, fn: () => void) => cartTimers.current.push(window.setTimeout(fn, ms))
    setCart(reduce ? "done" : "busy")
    later(reduce ? 0 : 650, () => {
      setCart("done")
      showToast()
    })
    later(reduce ? 1600 : 2100, () => setCart("idle"))
  }

  const showToast = () => {
    const variant = variants[shown.current]
    if (variant) onAddToCart?.({ variant, size, price: stats.price })
    setToastNote(variant ? L.toastNote(variant.name, size) : "")
    const t = toastRef.current
    if (!t) return
    toastTimer.current?.kill()
    gsap.killTweensOf(t)
    if (prefersReduced()) {
      gsap.set(t, { autoAlpha: 1, y: 0 })
      toastTimer.current = gsap.delayedCall(3, () => gsap.set(t, { autoAlpha: 0 }))
      return
    }
    gsap.fromTo(t, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power3.out" })
    toastTimer.current = gsap.delayedCall(3, () =>
      gsap.to(t, { autoAlpha: 0, y: 8, duration: 0.35, ease: "power2.in" }),
    )
  }

  // Hold a mouse or pen on the shoe for a loupe; tap it on touch to open the photos.
  const placeLoupe = (e: React.PointerEvent) => {
    const stage = shoeStageRef.current
    const img = shoeRefs.current[shown.current]
    const lp = loupeRef.current
    const li = loupeImgRef.current
    if (!stage || !img || !lp || !li) return
    const st = stage.getBoundingClientRect()
    const r = img.getBoundingClientRect()
    const L = lp.offsetWidth
    const Z = 2.2
    gsap.set(lp, { x: e.clientX - st.left - L / 2, y: e.clientY - st.top - L / 2 })
    li.style.backgroundSize = `${r.width * Z}px ${r.height * Z}px`
    li.style.backgroundPosition = `${-((e.clientX - r.left) * Z - L / 2)}px ${-((e.clientY - r.top) * Z - L / 2)}px`
  }
  const onStageDown = (e: React.PointerEvent) => {
    lastPointer.current = e.pointerType
    if (e.pointerType === "touch" || e.button !== 0) return
    const lp = loupeRef.current
    const li = loupeImgRef.current
    const cur = variants[shown.current]
    if (!lp || !li || !cur) return
    holding.current = true
    setHintSeen(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    li.style.backgroundImage = `url("${cur.src}")`
    if (tiltRef.current) gsap.to(tiltRef.current, { rotationX: 0, rotationY: 0, duration: 0.3 })
    placeLoupe(e)
    gsap.fromTo(lp, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: prefersReduced() ? 0 : 0.3, ease: "back.out(2)" })
  }
  const onStageMove = (e: React.PointerEvent) => {
    if (holding.current) placeLoupe(e)
  }
  const onStageUp = () => {
    if (!holding.current) return
    holding.current = false
    if (loupeRef.current) gsap.to(loupeRef.current, { autoAlpha: 0, scale: 0.7, duration: prefersReduced() ? 0 : 0.2 })
  }

  const v = variants[thumbSet] ?? variants[0]
  const views: SneakerView[] = v ? (v.gallery?.length ? v.gallery : FRAMINGS.map((f) => ({ ...f, src: v.src }))) : []
  const more = Math.max(0, views.length - 3)

  // Gallery: open, step, close, keyboard.
  const openViewer = (i: number) => {
    opener.current = document.activeElement as HTMLElement | null
    setViewer(i)
  }
  const closeViewer = React.useCallback(() => {
    setViewer(null)
    setVZoom(false)
    opener.current?.focus()
  }, [])
  const step = React.useCallback(
    (d: number) => {
      setVZoom(false)
      setViewer((i) => (i === null ? i : (i + d + views.length) % views.length))
    },
    [views.length],
  )
  React.useEffect(() => {
    if (viewer === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer()
      else if (e.key === "ArrowRight") step(1)
      else if (e.key === "ArrowLeft") step(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [viewer === null, closeViewer, step])
  const isOpen = viewer !== null
  React.useLayoutEffect(() => {
    if (!isOpen) return
    closeRef.current?.focus()
    if (!prefersReduced() && boxRef.current)
      gsap.fromTo(boxRef.current, { autoAlpha: 0, scale: 0.94, y: 16 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.45, ease: "power3.out" })
  }, [isOpen])
  const frameRef = React.useRef(null as HTMLDivElement | null)
  React.useLayoutEffect(() => {
    if (viewer === null || prefersReduced() || !frameRef.current) return
    gsap.fromTo(frameRef.current, { autoAlpha: 0.2, scale: 0.985 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power2.out" })
  }, [viewer])

  const tintOf = (vv: SneakerVariant) => vv.tint ?? vv.swatch
  const here = avail(active, size)
  const stockTone = here.soldOut ? "out" : here.stock !== undefined && here.stock <= lowStock ? "low" : "ok"
  const stockText =
    stockTone === "out"
      ? L.soldOutColour
      : stockTone === "low"
        ? L.onlyLeft(here.stock ?? 0, size)
        : L.inStock

  return (
    <section
      ref={rootRef}
      className={"snp-root" + (className ? " " + className : "")}
      style={{ minHeight: height, ["--snp-like" as string]: likeColor, ["--snp-tint" as string]: v ? tintOf(variants[active] ?? v) : "transparent", ...style }}
      aria-label={title}
    >
      <style>{`
.snp-root{position:relative;display:flex;flex-direction:column;width:100%;container-type:inline-size;overflow:hidden;isolation:isolate;
  color:var(--color-foreground);background:color-mix(in oklab,var(--color-foreground) 4%,var(--color-background));
  font-family:inherit;-webkit-font-smoothing:antialiased}
:where(.snp-root) :where(*,*::before,*::after){box-sizing:border-box}
:where(.snp-root) :where(button){font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer}
.snp-root img{max-width:none;display:block}
.snp-bg{position:absolute;inset:0;z-index:-1;opacity:0;transition:opacity .8s ease;pointer-events:none;
  background:radial-gradient(var(--snp-gs,48% 62%) at calc(50% + var(--mx,0%)) calc(var(--snp-gy,52%) + var(--my,0%)),color-mix(in oklab,var(--t) 42%,transparent),transparent 72%),
    color-mix(in oklab,var(--t) 15%,color-mix(in oklab,var(--color-foreground) 4%,var(--color-background)))}
.snp-bg[data-on="true"]{opacity:1}
.snp-body{position:relative;flex:1;display:grid;grid-template-columns:20cqw minmax(0,1fr) 17cqw;column-gap:3cqw;align-items:start;align-content:center;
  padding:4cqw 9cqw 4cqw 7.3cqw;overflow:hidden}
.snp-info{align-self:start;position:relative;z-index:1}
.snp-eyebrow{margin:0;font-size:max(12px,1.5cqw);color:var(--color-muted-foreground)}
.snp-title{margin:2cqw 0 0;font-size:max(22px,2.4cqw);line-height:1.18;font-weight:600;letter-spacing:-.01em;max-width:17cqw;text-wrap:balance}
.snp-desc{margin:3.6cqw 0 0;max-width:19cqw;font-size:max(11px,1.05cqw);line-height:1.45;font-style:italic;color:var(--color-muted-foreground)}
.snp-thumbs{display:flex;align-items:center;gap:2.4cqw;margin-top:9cqw}
.snp-thumbset{display:flex;align-items:center;gap:inherit}
.snp-thumb{flex:none;width:4.6cqw;height:3cqw;overflow:hidden;border-radius:4px;outline-offset:3px;transition:transform .25s}
.snp-thumb:hover{transform:translateY(-2px)}
.snp-view{display:block;width:100%;height:100%;background-repeat:no-repeat}
.snp-more{flex:none;width:3cqw;height:3cqw;display:grid;place-items:center;background:var(--color-foreground);color:var(--color-background);
  font-size:max(10px,1.05cqw);transition:transform .25s}
.snp-more:hover{transform:scale(1.08)}
.snp-stage{position:relative;align-self:stretch;max-height:42cqw;min-height:26cqw}
.snp-word{position:absolute;left:50%;top:0;translate:-50% -14%;font-size:11cqw;line-height:1;font-weight:800;letter-spacing:-.04em;
  text-transform:uppercase;white-space:nowrap;color:color-mix(in oklab,var(--t) 34%,transparent);pointer-events:none;user-select:none}
.snp-float{position:absolute;inset:0}
.snp-tilt{position:absolute;inset:0;transform-style:preserve-3d}
.snp-reflects{position:absolute;inset:0;pointer-events:none}
.snp-shoe.snp-reflect{transform:scaleY(-1);transform-origin:50% 88.5%;filter:blur(.6px);
  -webkit-mask-image:linear-gradient(to bottom,transparent 52%,#000 88%);mask-image:linear-gradient(to bottom,transparent 52%,#000 88%)}
.snp-shoe.snp-sheen{display:block;pointer-events:none;filter:none;
  background:linear-gradient(100deg,transparent 40%,rgba(255,255,255,.55) 50%,transparent 60%) 130% 0/300% 100% no-repeat;
  -webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
.snp-loupe{position:absolute;left:0;top:0;z-index:3;width:max(130px,15cqw);aspect-ratio:1;border-radius:50%;overflow:hidden;
  visibility:hidden;opacity:0;pointer-events:none;background:color-mix(in oklab,var(--snp-tint) 18%,var(--color-background));
  box-shadow:0 0 0 2px var(--color-background),0 18px 44px -12px rgba(0,0,0,.4)}
.snp-loupe>span{position:absolute;inset:0;background-repeat:no-repeat}
.snp-hint{position:absolute;left:3%;bottom:4%;transition:opacity .5s;font-size:max(10px,.85cqw);letter-spacing:.12em;text-transform:uppercase;
  color:var(--color-muted-foreground);pointer-events:none}
.snp-hint-touch{display:none}
.snp-hint[data-seen="true"]{opacity:0}
@media (pointer:fine){.snp-stage{cursor:zoom-in}}
@media (pointer:coarse){.snp-hint-fine{display:none}.snp-hint-touch{display:inline}}
.snp-shoe{position:absolute;left:50%;top:50%;width:96%;height:auto;aspect-ratio:16/9;object-fit:contain;translate:-50% -58%;
  filter:drop-shadow(0 1.6cqw 1.4cqw rgba(0,0,0,.12))}
.snp-floor{position:absolute;left:18%;right:14%;top:50%;height:4cqw;translate:0 6.6cqw;border-radius:50%;
  background:radial-gradient(closest-side,rgba(0,0,0,.22),transparent);filter:blur(4px)}
.snp-buy{align-self:start;font-size:max(11px,1.25cqw);position:relative;z-index:1}
.snp-label{display:block;font-size:max(12px,1.45cqw);color:var(--color-muted-foreground);letter-spacing:.02em}
.snp-sizes{display:flex;gap:1.6cqw;margin-top:1.5cqw}
.snp-size{width:max(32px,3.1cqw);height:max(32px,3.1cqw);border-radius:50%;display:grid;place-items:center;
  border:1.5px solid var(--color-foreground);font-size:max(11px,1.15cqw);font-weight:500;transition:background .25s,color .25s,transform .2s}
.snp-size:not(:disabled):hover{transform:scale(1.07)}
.snp-size[aria-pressed="true"]{background:var(--color-foreground);color:var(--color-background)}
.snp-size:disabled{opacity:.35;cursor:not-allowed;border-width:1px}
.snp-stock{display:flex;align-items:center;gap:.6cqw;margin-top:1.2cqw;font-size:max(10px,.95cqw);color:var(--color-muted-foreground)}
.snp-stock::before{content:"";width:max(6px,.55cqw);height:max(6px,.55cqw);border-radius:50%;background:#22c55e}
.snp-stock[data-tone="low"]{color:#c2410c}
.snp-stock[data-tone="low"]::before{background:#f97316}
.snp-stock[data-tone="out"]::before{background:var(--color-muted-foreground)}
.snp-row{display:flex;align-items:center;justify-content:space-between;margin-top:3cqw}
.snp-rating{display:flex;align-items:center;gap:.6cqw}
.snp-stars{position:relative;display:inline-block;color:var(--color-muted-foreground)}
.snp-starrow{display:flex;gap:.35cqw}
.snp-starfill{position:absolute;inset:0;color:var(--color-foreground);transition:clip-path .6s cubic-bezier(.2,.8,.2,1)}
.snp-stars svg{width:max(11px,1.25cqw);height:max(11px,1.25cqw)}
.snp-count{font-size:max(10px,1cqw);color:var(--color-muted-foreground);font-variant-numeric:tabular-nums}
.snp-price{display:inline-block;font-weight:600;font-size:max(13px,1.4cqw);font-variant-numeric:tabular-nums}
.snp-colour{margin-top:3.1cqw}
.snp-swatches{display:flex;gap:2.4cqw;margin-top:3.2cqw}
.snp-swatch{width:max(30px,3.1cqw);height:max(30px,3.1cqw);border-radius:50%;background:var(--sw);
  box-shadow:inset 0 0 0 1px color-mix(in oklab,var(--color-foreground) 22%,transparent);transition:box-shadow .3s,transform .2s}
.snp-swatch:hover{transform:scale(1.08)}
.snp-swatch[aria-pressed="true"]{box-shadow:inset 0 0 0 max(3px,.3cqw) var(--sw),inset 0 0 0 max(6px,.65cqw) var(--color-background),
  inset 0 0 0 20cqw var(--sw)}
.snp-actions{position:relative;display:flex;align-items:center;gap:3.6cqw;margin-top:4.2cqw}
.snp-cta{height:max(40px,4.4cqw);padding:0 2cqw;background:var(--color-foreground);color:var(--color-background);
  font-weight:600;font-size:max(11px,1.15cqw);letter-spacing:.02em;white-space:nowrap;transition:transform .15s}
.snp-cta:active{transform:scale(.96)}
.snp-cta{position:relative;display:grid;place-items:center;min-width:max(150px,11.6cqw);overflow:hidden;transition:transform .15s,background .35s}
.snp-cta>span{grid-area:1/1;display:inline-flex;align-items:center;gap:.6em;transition:opacity .25s,transform .4s cubic-bezier(.2,.8,.2,1)}
.snp-cta-busy,.snp-cta-done{opacity:0;transform:translateY(70%)}
.snp-cta[data-state="busy"] .snp-cta-idle,.snp-cta[data-state="done"] .snp-cta-idle{opacity:0;transform:translateY(-70%)}
.snp-cta[data-state="busy"] .snp-cta-busy,.snp-cta[data-state="done"] .snp-cta-done{opacity:1;transform:none}
.snp-cta[data-state="done"]{background:#15803d;color:#fff}
.snp-cta-busy i{width:1.15em;height:1.15em;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:snp-spin .7s linear infinite}
@keyframes snp-spin{to{transform:rotate(360deg)}}
.snp-cta-done svg{width:1.25em;height:1.25em;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:24;stroke-dashoffset:24;transition:stroke-dashoffset .45s .12s ease}
.snp-cta[data-state="done"] .snp-cta-done svg{stroke-dashoffset:0}
.snp-cta:disabled{opacity:.45;cursor:not-allowed}
.snp-like{position:relative;width:max(24px,2.4cqw);height:max(24px,2.4cqw);display:grid;place-items:center}
.snp-like>svg{width:80%;height:80%;overflow:visible}
.snp-like>svg path{fill:none;stroke:currentColor;stroke-width:1.8;transition:fill .3s,stroke .3s}
.snp-like[aria-pressed="true"]>svg path{fill:var(--snp-like);stroke:var(--snp-like)}
.snp-burst{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}
.snp-burst svg{position:absolute;left:-6px;top:-6px;width:12px;height:12px;color:var(--snp-like);opacity:0}
.snp-pill{position:absolute;right:-.4cqw;bottom:calc(100% + 1cqw);padding:.6cqw 1.2cqw;border-radius:999px;white-space:nowrap;
  background:var(--color-foreground);color:var(--color-background);font-size:max(10px,.95cqw);font-weight:500;
  visibility:hidden;opacity:0;pointer-events:none}
.snp-pill b{color:var(--snp-like);font-weight:700}
.snp-toast{position:absolute;left:50%;bottom:6.6cqw;translate:-50% 0;display:flex;align-items:center;gap:1cqw;padding:1.1cqw 2.2cqw;
  border-radius:999px;background:var(--color-background);font-size:max(11px,1cqw);font-weight:500;white-space:nowrap;
  box-shadow:0 6px 24px color-mix(in oklab,var(--color-foreground) 8%,transparent);visibility:hidden;opacity:0;z-index:2}
.snp-toast i{width:max(9px,1cqw);height:max(9px,1cqw);border-radius:50%;background:#22c55e;
  box-shadow:0 0 0 3px color-mix(in oklab,#22c55e 25%,transparent)}
.snp-toast small{font-size:inherit;color:var(--color-muted-foreground);font-weight:400}
.snp-viewer{position:fixed;inset:0;z-index:60;display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:24px}
.snp-scrim{position:absolute;inset:0;background:color-mix(in oklab,var(--color-background) 72%,transparent);backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);cursor:zoom-out}
.snp-box{position:relative;width:min(880px,100%);display:flex;flex-direction:column;gap:14px}
.snp-frame{position:relative;aspect-ratio:16/10;max-height:72vh;width:100%;border-radius:14px;overflow:hidden;
  background:radial-gradient(60% 70% at 50% 55%,color-mix(in oklab,var(--snp-tint) 38%,transparent),transparent 75%),
    color-mix(in oklab,var(--snp-tint) 14%,var(--color-background));
  box-shadow:0 30px 80px -20px rgba(0,0,0,.35)}
.snp-frame .snp-view{position:absolute;inset:0;width:auto;height:auto;transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.snp-frame{cursor:zoom-in}
.snp-frame[data-zoom="true"]{cursor:zoom-out}
.snp-vbar{display:flex;align-items:center;gap:12px;font-size:14px}
.snp-vbar strong{font-weight:600}
.snp-vbar span{color:var(--color-muted-foreground);font-variant-numeric:tabular-nums}
.snp-vbtn{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--color-background);
  box-shadow:0 0 0 1px color-mix(in oklab,var(--color-foreground) 14%,transparent);transition:transform .2s}
.snp-vbtn:hover{transform:scale(1.08)}
.snp-vbtn svg{width:18px;height:18px}
.snp-nav-l,.snp-nav-r{position:absolute;top:50%;translate:0 -50%}
.snp-nav-l{left:14px}.snp-nav-r{right:14px}
.snp-close{margin-left:auto}
.snp-rail{display:flex;gap:8px;overflow-x:auto;padding:2px}
.snp-rail button{flex:none;width:76px;height:48px;border-radius:8px;overflow:hidden;opacity:.55;transition:opacity .2s;
  background:color-mix(in oklab,var(--snp-tint) 12%,var(--color-background))}
.snp-rail button[aria-current="true"]{opacity:1;box-shadow:0 0 0 2px var(--color-foreground)}
@container (max-width:760px){
  .snp-body{grid-template-columns:1fr;grid-template-rows:auto auto auto;padding:24px 20px 72px;row-gap:8px;align-items:start}
  .snp-desc{max-width:none;margin-top:12px}
  .snp-thumbs{margin-top:16px;gap:16px}
  .snp-thumb{width:56px;height:36px}
  .snp-more{width:36px;height:36px}
  .snp-stage{order:-1;min-height:60cqw}
  .snp-word{font-size:20cqw;top:0}
  .snp-info{display:contents}
  .snp-eyebrow{order:-3}
  .snp-title{order:-2;margin-top:4px;max-width:none}
  .snp-desc,.snp-thumbs{order:2}
  .snp-floor{height:9cqw;translate:0 15cqw}
  .snp-buy{order:1}
  .snp-sizes{gap:10px;margin-top:10px}
  .snp-row,.snp-colour{margin-top:18px}
  .snp-rating{gap:6px}
  .snp-swatches{margin-top:12px;gap:16px}
  .snp-actions{margin-top:22px;gap:20px}
  .snp-cta{flex:1}
  .snp-stock{margin-top:8px;gap:6px}
  .snp-hint{bottom:2%}
  .snp-pill{padding:6px 10px;bottom:calc(100% + 8px)}
  .snp-toast{left:50%;bottom:20px;padding:10px 18px;gap:8px}
  .snp-viewer{padding:12px}
  .snp-bg{--snp-gy:22%;--snp-gs:85% 26%}
  .snp-rail button{width:60px;height:40px}
  .snp-nav-l{left:8px}.snp-nav-r{right:8px}
  .snp-vbtn{width:36px;height:36px}
}
@media (prefers-reduced-motion: reduce){
  .snp-root *{transition:none!important;animation:none!important}
}
`}</style>

      {variants.map((vv, i) => (
        <span key={i} className="snp-bg" data-on={i === active} style={{ ["--t" as string]: tintOf(vv) }} aria-hidden="true" />
      ))}

      <div className="snp-body">
        <div className="snp-info">
          <p className="snp-eyebrow">{eyebrow}</p>
          <h2 className="snp-title">{title}</h2>
          <p className="snp-desc">{description}</p>
          <div className="snp-thumbs">
            <span className="snp-thumbset" ref={thumbsRef}>
              {views.slice(0, 3).map((vw, i) => (
                <button key={i} type="button" className="snp-thumb" aria-label={`View ${vw.label ?? `photo ${i + 1}`}`} onClick={() => openViewer(i)}>
                  <span className="snp-view" style={viewStyle(vw)} />
                </button>
              ))}
            </span>
            {more > 0 && (
              <button type="button" className="snp-more" aria-label={`View all ${views.length} photos`} onClick={() => openViewer(3)}>
                +{more}
              </button>
            )}
          </div>
        </div>

        <div
          className="snp-stage"
          ref={shoeStageRef}
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={onStageUp}
          onPointerCancel={onStageUp}
          onClick={() => {
            if (lastPointer.current === "touch") openViewer(0)
          }}
        >
          {variants.map((vv, i) => (
            <span
              key={i}
              ref={(el) => {
                wordRefs.current[i] = el
              }}
              className="snp-word"
              style={{ ["--t" as string]: tintOf(vv), visibility: i === active ? "visible" : "hidden" }}
              aria-hidden="true"
            >
              {vv.name}
            </span>
          ))}
          <span className="snp-floor" ref={floorRef} aria-hidden="true" />
          <div className="snp-reflects" ref={reflectWrapRef} aria-hidden="true">
            {variants.map((vv, i) => (
              <img
                key={i}
                ref={(el) => {
                  reflectRefs.current[i] = el
                }}
                className="snp-shoe snp-reflect"
                src={vv.src}
                alt=""
                draggable={false}
                style={{ visibility: i === active ? "visible" : "hidden" }}
              />
            ))}
          </div>
          <div className="snp-float" ref={floatRef}>
            <div className="snp-tilt" ref={tiltRef}>
            {variants.map((vv, i) => (
              <img
                key={i}
                ref={(el) => {
                  shoeRefs.current[i] = el
                }}
                className="snp-shoe"
                src={vv.src}
                alt={i === active ? `${title} in ${vv.name}` : ""}
                aria-hidden={i === active ? undefined : true}
                draggable={false}
                style={{ visibility: i === active ? "visible" : "hidden" }}
              />
            ))}
              <span
                className="snp-shoe snp-sheen"
                ref={sheenRef}
                aria-hidden="true"
                style={{ WebkitMaskImage: `url("${variants[active]?.src}")`, maskImage: `url("${variants[active]?.src}")` }}
              />
            </div>
          </div>
          <span className="snp-loupe" ref={loupeRef} aria-hidden="true">
            <span ref={loupeImgRef} />
          </span>
          <span className="snp-hint" data-seen={hintSeen} aria-hidden="true">
            <span className="snp-hint-fine">{L.holdToZoom}</span>
            <span className="snp-hint-touch">{L.tapToView}</span>
          </span>
        </div>

        <div className="snp-buy">
          <span className="snp-label">{L.size}</span>
          <div className="snp-sizes" role="group" aria-label="Size">
            {sizes.map((s) => (
              <button
                key={s.label}
                type="button"
                className="snp-size"
                aria-pressed={size === s.label}
                disabled={avail(active, s.label).soldOut}
                aria-label={avail(active, s.label).soldOut ? `Size ${s.label}, sold out` : `Size ${s.label}`}
                onClick={() => setSize(s.label)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="snp-stock" data-tone={stockTone} aria-live="polite">
            {stockText}
          </span>
          {showReviews && (
            <div className="snp-row">
              <span className="snp-label">{L.reviews}</span>
              <span className="snp-rating">
                <Stars value={stats.rating} />
                <span className="snp-count" ref={countRef} aria-label="reviews">
                  ({first.current.reviews})
                </span>
              </span>
            </div>
          )}
          <div className="snp-row" aria-live="polite">
            <span className="snp-label">{L.price}</span>
            <span className="snp-price" ref={priceRef}>
              {formatPrice ? formatPrice(first.current.price) : currency + first.current.price}
            </span>
          </div>
          <span className="snp-label snp-colour">{L.colour}</span>
          <div className="snp-swatches" role="group" aria-label="Colour">
            {variants.map((vv, i) => (
              <button
                key={i}
                type="button"
                className="snp-swatch"
                aria-pressed={i === active}
                aria-label={vv.name}
                style={{ ["--sw" as string]: vv.swatch }}
                onClick={() => pick(i)}
              />
            ))}
          </div>
          <div className="snp-actions">
            <button type="button" className="snp-cta" data-state={cart} onClick={addToCart} disabled={here.soldOut} aria-live="polite">
              <span className="snp-cta-idle">{here.soldOut ? L.soldOutCta : L.addToCart}</span>
              <span className="snp-cta-busy" aria-hidden="true">
                <i />
              </span>
              <span className="snp-cta-done">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.2 4.2L19 7" />
                </svg>
                {L.added}
              </span>
            </button>
            <button ref={likeRef} type="button" className="snp-like" aria-pressed={liked} aria-label="Save to favourites" onClick={like}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={HEART} />
              </svg>
              <span className="snp-burst" ref={burstRef} aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <svg key={i} viewBox="0 0 24 24">
                    <path d={HEART} fill="currentColor" />
                  </svg>
                ))}
              </span>
            </button>
            <span className="snp-pill" ref={pillRef} role="status" aria-live="polite">
              {liked ? <b>♥ </b> : null}
              {likeMsg}
            </span>
          </div>
        </div>

        <div className="snp-toast" ref={toastRef} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {toast}
          {toastNote && <small>· {toastNote}</small>}
        </div>
      </div>

      {viewer !== null && views[viewer] && (
        <div className="snp-viewer" role="dialog" aria-modal="true" aria-label={`${title} photos`}>
          <button type="button" className="snp-scrim" aria-label="Close photos" tabIndex={-1} onClick={closeViewer} />
          <div className="snp-box" ref={boxRef}>
            <div className="snp-vbar">
              <strong>{views[viewer].label ?? "Photo"}</strong>
              <span>
                {viewer + 1} / {views.length}
              </span>
              <button ref={closeRef} type="button" className="snp-vbtn snp-close" aria-label="Close photos" onClick={closeViewer}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div
              className="snp-frame"
              ref={frameRef}
              data-zoom={vZoom}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return
                setVZoom((z) => !z)
              }}
              onPointerMove={(e) => {
                if (!vZoom) return
                const r = e.currentTarget.getBoundingClientRect()
                const el = e.currentTarget.firstElementChild as HTMLElement | null
                if (el) el.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`
              }}
            >
              <span
                className="snp-view"
                style={{
                  ...viewStyle(views[viewer]),
                  transform: `${views[viewer].mirror ? "scaleX(-1) " : ""}scale(${vZoom ? 2.2 : 1})`,
                }}
                role="img"
                aria-label={`${v?.name} ${views[viewer].label ?? ""}`}
              />
              <button type="button" className="snp-vbtn snp-nav-l" aria-label="Previous photo" onClick={() => step(-1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <button type="button" className="snp-vbtn snp-nav-r" aria-label="Next photo" onClick={() => step(1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="snp-rail">
              {views.map((vw, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Show ${vw.label ?? `photo ${i + 1}`}`}
                  aria-current={i === viewer}
                  onClick={() => {
                    setVZoom(false)
                    setViewer(i)
                  }}
                >
                  <span className="snp-view" style={viewStyle(vw)} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
