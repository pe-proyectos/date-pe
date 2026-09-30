---
name: date.pe
description: Reserva tu corte en un minuto y paga el adelanto con Yape. Barbershop booking for Peru, in daylight.
colors:
  ink: "#0a0a0a"
  ink-2: "#27272a"
  mute: "#5f5f66"
  soft: "#71717a"
  line: "#e6e6e9"
  line-2: "#d4d4d8"
  field: "#f4f4f5"
  canvas: "#ffffff"
  red: "#d91023"
  red-deep: "#b30d1c"
  red-tint: "#fdecee"
  pole-blue: "#1d3f94"
  ok: "#0f7a3d"
  ok-tint: "#e8f5ee"
  chart-series: "#3f3f46"
  chart-series-hover: "#0a0a0a"
  staff-1: "#2f5bd3"
  staff-2: "#d97706"
  staff-3: "#0a9a8a"
  staff-4: "#b83fc4"
  staff-5: "#5f8f14"
  staff-6: "#e0457b"
typography:
  display:
    fontFamily: "Figtree, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.75rem, 5.6vw, 5.25rem)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.04em"
    fontFeature: "'ss01', 'cv11'"
  headline:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.6vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title-sm:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  label-xs:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  inner: "8px"
  card: "12px"
  field: "12px"
  sheet: "20px"
  pill: "9999px"
spacing:
  gutter-mobile: "20px"
  gutter-desktop: "32px"
  section-mobile: "80px"
  section-desktop: "96px"
  section-desktop-lg: "112px"
  container: "1280px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.canvas}"
  button-accent:
    backgroundColor: "{colors.red}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
  button-accent-hover:
    backgroundColor: "{colors.red-deep}"
    textColor: "{colors.canvas}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.field}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-danger-hover:
    backgroundColor: "{colors.red-tint}"
  chip:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  chip-hover:
    backgroundColor: "{colors.line}"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.card}"
    padding: "24px"
  slot-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.card}"
  sheet:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.sheet}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: "12px 20px 12px 16px"
  tab-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.soft}"
    typography: "{typography.label-xs}"
---

# Design System: date.pe

## Overview

**Creative North Star: "The Barber Pole in Daylight"**

date.pe is a white room with one red stripe in it. The ground is pure white, the ink is near black, the grays are faintly cool, and the only color with a voice is rojo Peru, the red shared by the barber pole and the flag. Everything else is carried by typography, hairlines, real daylight photography of barbershops, and the booking interface itself doing its job. The craft bar is Airbnb and Apple: calm, generous, confident, with nothing on the page that is not either content or an action.

Density is low on discovery surfaces (home, search, district, tenant sites) and moderate in the admin, where lists and agendas sit directly on the ground separated by 1px lines rather than boxed in cards. Enclosure is rare. When something is selected, it becomes black, lifts by a hair and gains the one lifted shadow, and its siblings may dim; selection is the loudest event on any screen.

The phone is the primary device, so the web behaves like a native app there: bottom tab bars, bottom sheets that drag to dismiss and close on the browser back gesture, a pinch-zoom lightbox, safe-area insets, 16px inputs on coarse pointers, and a pressed scale on every tappable element. The owner rejected an earlier glass/liquid design; this white, daylight direction is the approved one.

**Key Characteristics:**
- White ground, near-black ink, one accent (rojo Peru) reserved for the single focused action.
- Figtree as the only face, semibold headlines with tight negative tracking, tabular numerals for money and time.
- 1px hairlines instead of boxes and shadows; 12px corners on cards and fields; black pill buttons.
- One lifted shadow for the selected or raised item, one pop shadow for floating overlays.
- Lucide line icons at 1.75 stroke.
- Motion is purposeful: CSS scroll-driven reveals, slow image zoom on hover, sheets that rise, a barber pole that spins on hover.
- Native mobile grammar: tab bars, bottom sheets, back-to-close, safe areas, press feedback.

## Colors

A daylight neutral palette with a single hot accent; color is scarce so that the red always means "this is the action".

### Primary
- **Rojo Peru** (red): the one accent. Used for the search submit ("Buscar"), the mobile search trigger, the focus ring, the text caret, the calendar now-indicator, one closing call-to-action band per page, and the red stripes of the pole mark. Never for decoration, borders or body text.
- **Rojo Profundo** (red-deep): hover and pressed state of red surfaces; text on red tints.
- **Rubor** (red-tint): text selection background and the hover wash of destructive ghost buttons.

### Secondary
- **Azul Poste** (pole-blue): the blue stripes of the barber-pole brand mark and app icon. It is a brand-mark color, not an interface color.

### Neutral
- **Tinta** (ink): all primary text, primary pill buttons, selected chips, selected slots, toasts, active tab icons.
- **Tinta Suave** (ink-2): hover of ink buttons.
- **Gris Medio** (mute): secondary text, subtitles, metadata, inactive desktop nav links.
- **Gris Claro** (soft): tertiary text, placeholders, inactive tab labels, chart axis labels, empty-state icons.
- **Línea** (line): the default 1px hairline for dividers, list rows, card borders, header border on scroll, chart grid.
- **Línea Fuerte** (line-2): input borders, dashed empty-state borders, switch track off, sheet grab handle, scrollbar thumb.
- **Campo** (field): secondary fills: chips, hover washes, image placeholders, skeletons, full-bleed alternate sections.
- **Lienzo** (canvas): the ground. Pure white on every surface.
- **Verde Confirmado** (ok) and **Verde Tenue** (ok-tint): success only, as in completed bookings and confirmation states.

### Data
- **Serie** (chart-series) with **Serie Hover** (chart-series-hover): a graphite ink for every single-series column and bar chart; hover deepens it to full ink. Charts add no second accent to the page. A single series carries no legend; the chart title names it.
- **Staff categorical** (staff-1 to staff-6): the fixed identity color per barber, assigned by index in this exact order and validated for color blindness. Beyond six, fall back to a neutral gray.

### Named Rules
**The One Red Rule.** Rojo Peru appears on one focused action per viewport, plus at most one closing red band per page. If two red things compete on a screen, one of them is wrong.

**The Pole Stays on the Pole Rule.** Azul Poste lives in the barber-pole mark. Interface states, links and badges do not borrow it.

**The Ink Data Rule.** Single-series charts are drawn in graphite ink, never the brand red and never a second accent, so data never reads as an action or an error and the page keeps one red. Categorical hues exist only to tell barbers apart.

## Typography

**Display Font:** Figtree (self-hosted variable woff2, weights 400 to 800, with ui-sans-serif, system-ui, -apple-system, Segoe UI fallback)
**Body Font:** Figtree
**Label/Mono Font:** Figtree (monospace appears only inside discount-code inputs)

**Character:** One humanist geometric sans, the closest free relative of Airbnb Cereal, set semibold and tightly tracked for headlines and regular for reading. Stylistic sets ss01 and cv11 are on globally.

### Hierarchy
- **Display** (600, clamp(2.75rem, 5.6vw, 5.25rem), 0.98): the home hero headline only, two lines, the second line in Gris Medio.
- **Headline** (600, clamp(2rem, 3.6vw, 3rem), 1.05): section headings on discovery pages. Smaller variants down to clamp(1.75rem, 3vw, 2.5rem) for secondary sections.
- **Title** (600, 28px, 1.2): admin page titles.
- **Title Small** (600, 17px, 1.3): sheet titles, card and empty-state titles, list headers.
- **Body** (400, 15px, 1.5): the workhorse size for copy, list rows, nav links, metadata. 16px on mobile form and sheet content. Keep paragraphs near 60ch.
- **Label** (500, 13px to 14px): field labels, button text (14px), hints (13px), status pills (12px).
- **Label XS** (500, 11px): mobile tab bar labels and tiny "Ejemplo" tags only.

### Named Rules
**The Tight Heading Rule.** Every h1 to h3 carries negative tracking (between -0.02em and -0.04em, tighter as size grows) and balanced wrapping; body paragraphs use pretty wrapping.

**The Tabular Money Rule.** Prices in soles, times, dates and counts use tabular numerals so columns and slot grids align.

**The Sentence Case Rule.** No uppercase eyebrows or tracked-out kickers above headings. Uppercase exists only where the data is uppercase, such as discount codes.

## Layout

A centered 1280px container with 20px gutters on mobile and 32px from 768px up. Discovery sections breathe with 80px vertical padding on mobile and 96px to 112px on desktop. The home hero splits on a 12-column grid from 1024px: headline, one sentence, search bar and district chips on the left six columns, a daylight photo with an overlapping live booking card on the right six. Image grids run four across on desktop (4:5 portraits for districts and services, 4:3 for shop cards) and collapse to horizontal scrollers or two columns on mobile.

Content sits on the ground. Alternate sections use a full-bleed Campo fill rather than cards. The admin uses a left sidebar on desktop and a bottom tab bar plus a "Más" sheet on mobile; its lists are rows divided by hairlines.

Responsive breakpoints: at 768px the mobile tab bar hides, the header grows from 56px to 64px, and bottom sheets become right-side panels. At 1024px multi-column heroes and sticky booking summaries engage. On coarse pointers inputs are forced to at least 16px so iOS never zooms. Fixed bars respect `env(safe-area-inset-*)`.

## Elevation & Depth

Flat by default. Depth comes from white-on-white hairlines and from Campo fills, not shadows. Two shadow tokens exist and each has one job. The sticky header and mobile tab bar are the only translucent surfaces: 90 to 95% white with a background blur so content scrolls beneath them.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 18px 40px -16px rgb(10 10 10 / 0.28), 0 2px 8px rgb(10 10 10 / 0.06)`): the selected or raised item: a picked time slot, the active search segment, an open search section, the sticky booking card on tenant sites, a floating contact button, the gallery "see all" pill.
- **Pop** (`box-shadow: 0 24px 60px -20px rgb(10 10 10 / 0.35), 0 4px 14px rgb(10 10 10 / 0.08)`): floating overlays that sit above the page: bottom sheets and side panels, search dropdown panels, toasts.

### Named Rules
**The Selection Earns the Shadow Rule.** Resting cards, rows and images carry no shadow. A shadow appears only when an item is selected, floats above content, or must stay reachable while scrolling.

## Shapes

Soft, consistent geometry. Cards, photos, fields and slot tiles share gently curved 12px corners; small inner elements (icon tiles, list hover rows, calendar events) use 8px. Every button, chip, toggle, toast, status pill and the search bar is a full pill. Bottom sheets round only their top corners at 20px and carry a 40px by 6px grab handle. Borders are always 1px; dashed borders mark empty states only. Avatars are circles. The barber pole mark is the one illustrative silhouette: a rounded capsule with black caps and diagonal red and blue stripes.

## Components

### Buttons
Quiet, black and round; the red one is rare.
- **Shape:** full pill (9999px).
- **Primary:** Tinta fill, white 14px medium text, 10px by 16px padding; hover to Tinta Suave. Used for "Registra tu barbería", "Ver mi página", sheet confirmations.
- **Accent:** Rojo Peru fill, white text; hover to Rojo Profundo. Reserved for the search submit and the single most important action in a flow.
- **Secondary:** white with a 1px Línea border; hover darkens the border to Tinta.
- **Ghost:** no fill; hover washes Campo. **Danger:** red text; hover washes Rubor.
- **Busy / Disabled:** a spinning Loader icon before the label; disabled at 40% opacity.
- **Focus:** 2px Rojo Peru outline with 2px offset on every focusable element.
- **Press (touch):** scale to 0.97 over 140ms on devices without hover.

### Chips
- **Style:** Campo fill, 14px to 15px text, pill, no border; hover to Línea.
- **Selected:** Tinta fill with white text. Filter chips in sheets may use a 1px Línea border when unselected.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Lienzo, bordered by a 1px Línea hairline, or no container at all (shop cards are just an image plus text).
- **Shadow Strategy:** none at rest; Lift when selected or sticky (see Elevation & Depth).
- **Internal Padding:** 20px to 24px.
- **Media:** photos sit in 12px-rounded frames with a Campo placeholder and zoom to 1.04 over 900ms on hover.

### Inputs / Fields
- **Style:** white fill, 1px Línea Fuerte border, 12px corners, 10px by 14px padding (roomier in booking forms), 15px text and 16px on touch devices; label above in 14px medium, hint below in 13px Gris Claro.
- **Focus:** the border shifts to Tinta; no glow.
- **Switch:** 40px by 24px pill track, Tinta when on, Línea Fuerte when off, white knob.

### Navigation
- **Header:** sticky, 56px mobile and 64px desktop, translucent white; a Línea bottom border appears only after 8px of scroll. Logo left, 15px Gris Medio links center that turn Tinta on hover, "Ingresar" ghost and a black primary pill right.
- **Mobile tab bar:** fixed bottom, four tabs, 23px Lucide icons over 11px labels; active tab in Tinta with a heavier stroke, inactive in Gris Claro; safe-area bottom padding and a light haptic on tap.
- **Admin sidebar:** 15px rows with 1.75-stroke icons; the active row sits on a Campo wash.

### Bottom Sheet
The signature mobile container. On phones it rises from the bottom (380ms), has a grab handle, follows the finger, and dismisses on a drag past 110px or a fast flick; the backdrop is Tinta at 30% and fades as you drag. The browser back gesture and Escape close it. A `full` variant takes the whole screen for search and long forms. From 768px it becomes a right-side panel up to 448px wide that slides in over 320ms. Header 56px to 64px with a hairline, footer actions pinned with safe-area padding.

### Search Bar
Desktop: one pill with three segments (Dónde, Qué, Cuándo) separated by hairlines, each a 12px medium label over a 15px value, and a red "Buscar" pill at the end; the active segment turns white and lifts. Mobile: a single pill with a red circular icon that opens a full-screen sheet stepping through place, service and day.

### Booking Slots and Live Card
Slot tiles are 12px-rounded with a Línea border; the picked slot turns Tinta, rises 2px and takes Lift while its siblings dim to 35% opacity and grayscale. The home hero's live booking card plays the real sequence (barber, day strip, slot, Yape deposit, confirmation with a drawn check) course by course.

### Lightbox
Full-screen image viewer with pinch and double-tap zoom, drag to pan, swipe between photos, and back-to-close.

### Toasts and Status
Toasts are ink pills with a white 14px message and a status icon, top-center on mobile below the safe area and top-right on desktop, rising in over 500ms. Status pills are 12px medium text on a pale tint, fully rounded.

### Charts
Hand-built SVG columns and bars in the single graphite Serie on a Línea grid with 11px Gris Claro axis labels; hover deepens the bar and shows the value. Every chart offers a table toggle. Staff are colored by the fixed categorical order.

### Pole Mark
The logo: a small barber pole beside "date.pe" in 19px semibold at -0.035em. Its stripes spin (1.4s linear) only on hover or when marked live, and stop under reduced motion.

### Motion
One easing curve for everything: `cubic-bezier(0.16, 1, 0.3, 1)`. Sections and cards reveal with a CSS scroll-driven animation (`animation-timeline: view()`, rise 18px and unblur 6px across the first 55% of entry); without support, content is simply visible. Arrow icons nudge 3px to 4px on hover, accordions open by animating grid rows and rotate their plus icon 45 degrees, pages fade in over 220ms. All of it is disabled under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** keep the ground pure white and let hairlines (1px Línea) separate content before reaching for a container.
- **Do** spend Rojo Peru on one focused action per viewport: the search submit, the key step in a flow, or one closing band per page.
- **Do** use black pill buttons for primary actions and 12px corners for cards, photos, fields and slots.
- **Do** mark selection by turning the item Tinta and giving it the Lift shadow; dim siblings when the choice matters.
- **Do** use Lucide line icons at 1.75 stroke, inlined at 16px to 23px.
- **Do** set prices, times and counts in tabular numerals, with soles written as "S/ 35.00".
- **Do** use real daylight photography of barbershop moments in 12px-rounded frames.
- **Do** give every mobile surface its native behavior: bottom sheets with drag-to-dismiss and back-to-close, safe-area insets, 16px inputs on touch, pressed scale 0.97.
- **Do** gate every animation behind `prefers-reduced-motion` and make scroll reveals degrade to visible content.
- **Do** draw single-series charts in the graphite Serie and the fixed staff order for barbers.

### Don't:
- **Don't** use em dashes or en dashes anywhere in UI copy; use commas, colons or periods.
- **Don't** use emojis or decorative text symbols; use real icons from the icon library.
- **Don't** build glass or liquid surfaces: no frosted cards, gradient panels or dark gradient heroes. The only translucency is the white sticky header and tab bar.
- **Don't** add a second accent color or use Azul Poste outside the barber-pole mark.
- **Don't** put shadows on resting cards or rows, and don't invent shadows beyond Lift and Pop.
- **Don't** add a second typeface or use a system display face for headlines.
- **Don't** put uppercase eyebrows or kickers above headings.
- **Don't** fake social proof, counters or scarcity in the visual design; show real availability and prices.
