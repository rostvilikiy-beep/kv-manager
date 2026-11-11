import * as React from "react"
import SneakerProductHero, { type SneakerVariant, type SneakerView } from "@/components/ui/sneaker-product-hero"

import gelk from "./assets/gelk.png"
import gelkFront from "./assets/gelk-front.jpg"
import gelkSide from "./assets/gelk-side.jpg"
import gelkBottle from "./assets/gelk-bottle.png"
import ozo from "./assets/ozo.png"
import ozoFront from "./assets/ozo-front.jpg"
import ozoSide from "./assets/ozo-side.jpg"
import ozoBottle from "./assets/ozo-bottle.png"
import immuno from "./assets/immuno.png"
import immunoFront from "./assets/immuno-front.jpg"
import immunoSide from "./assets/immuno-side.jpg"
import immunoBottle from "./assets/immuno-bottle.png"

// Carton + bottle cut out of the shop photos; the gallery adds the flattened
// carton faces and the bottle on its own.
const gallery = (set: string, front: string, side: string, bottle: string): SneakerView[] => [
  { src: set, label: "Zestaw" },
  { src: front, label: "Przód pudełka" },
  { src: side, label: "Bok pudełka" },
  { src: bottle, label: "Butelka" },
  { src: set, label: "Etykieta butelki", focus: [0.62, 0.62], zoom: 2 },
]

// Each product comes in one volume, so the "size" row doubles as the volume:
// Gel K is the 6 ml product, the other two are 8 ml.
const variants: SneakerVariant[] = [
  {
    name: "Gel K",
    swatch: "#139488",
    tint: "#5fc9bd",
    src: gelk,
    gallery: gallery(gelk, gelkFront, gelkSide, gelkBottle),
    soldOut: ["8 ml"],
  },
  {
    name: "Ozodrop",
    swatch: "#2b8fd8",
    tint: "#7cc0f0",
    src: ozo,
    gallery: gallery(ozo, ozoFront, ozoSide, ozoBottle),
    soldOut: ["6 ml"],
  },
  {
    name: "Immunodrop",
    swatch: "#1aa36a",
    tint: "#86d4a8",
    src: immuno,
    gallery: gallery(immuno, immunoFront, immunoSide, immunoBottle),
    soldOut: ["6 ml"],
  },
]

const sizes = [
  { label: "6 ml", price: 38.71 },
  { label: "8 ml", price: 49.01 },
]

const pln = (n: number): string =>
  n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł"

interface Line {
  name: string
  size: string
  price: number
}

export default function CatalogApp(): React.JSX.Element {
  const [cart, setCart] = React.useState<Line[]>([])
  const total = cart.reduce((s, l) => s + l.price, 0)

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-16 items-center justify-between gap-4 border-b px-4 sm:px-8">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">FB Vision</p>
          <p className="truncate text-xs text-muted-foreground">Krople i żel do oczu</p>
        </div>
        <div
          className="flex items-center gap-3 rounded-full border px-4 py-1.5 text-sm tabular-nums"
          aria-live="polite"
        >
          <span>{pln(total)}</span>
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background">
            {cart.length}
          </span>
        </div>
      </header>

      <SneakerProductHero
        variants={variants}
        defaultVariant={0}
        eyebrow="FB Vision · pielęgnacja oczu"
        title="Ozodrop i Immunodrop"
        description="Nawilżające krople i żel do oczu w sterylnych butelkach z kroplomierzem. Wybierz produkt kółkiem koloru; pojemność dopasuje się sama."
        sizes={sizes}
        price={49.01}
        formatPrice={pln}
        showReviews={false}
        toast="Koszyk zaktualizowany"
        height="calc(100svh - 4rem)"
        labels={{
          size: "POJEMNOŚĆ",
          price: "CENA",
          colour: "PRODUKT",
          addToCart: "DO KOSZYKA",
          soldOutCta: "NIEDOSTĘPNE",
          added: "DODANO",
          soldOutColour: "Niedostępny w tej wersji",
          onlyLeft: (n) => `Zostało tylko ${n} szt.`,
          inStock: "Dostępny",
          saved: "Dodano do ulubionych",
          removed: "Usunięto z ulubionych",
          holdToZoom: "Przytrzymaj, aby powiększyć",
          tapToView: "Dotknij, aby zobaczyć zdjęcia",
          toastNote: (v, s) => `${v} · ${s}`,
        }}
        onAddToCart={({ variant, size, price }) =>
          setCart((c) => [...c, { name: variant.name, size, price }])
        }
      />
    </div>
  )
}
