# Product

<!-- impeccable:product-schema 1 -->

> Inferred from the owner's written brief in chat (2026-09-29/30). The owner asked for autonomous work without an interview round; every fact below comes from their messages or the repository, nothing was confirmed in a Q&A.

## Platform

web

## Users

- **Clients (primary visitor):** people in Lima and the rest of Peru who want a haircut, fade, beard trim or shave. Mostly on a phone, often arriving from Google, WhatsApp or Instagram. Job: find a barbershop nearby, pick a barber and a time, and lock the slot without calling.
- **Barbershop owners and managers:** small shops that rent date.pe for S/50 per month. Job: get their own booking site at `{slug}.date.pe`, run the agenda with their team, and stop losing income to no-shows.
- **Platform admin:** the date.pe owner. Job: onboard shops, watch usage and payments across every tenant.

## Product Purpose

date.pe is a multi-tenant booking platform for barbershops in Peru. `date.pe` is the discovery hub (search by district, service and day, SEO pages per district, blog). Each shop gets an independent white-label site and booking flow on its own subdomain, plus an admin panel. Success means a client books in under a minute and a shop fills its chairs with fewer no-shows.

## Positioning

Built for how Peru pays and books: a deposit with Yape or Plin (through MercadoPago or Culqi) or PayPal to secure the slot, prices in soles, a flat S/50 per month with no commission per booking, a branded subdomain per shop, and booking in the browser without installing an app.

## Operating Context

- Clients today book barbershops by WhatsApp message, Instagram DM, phone call or walk-in.
- Payments in Peru run on Yape/Plin wallets; cards are less common.
- Deployment: one Linux VPS behind Coolify/Traefik, Cloudflare in front, media on Cloudflare R2 at `r2.date.pe`.

## Capabilities and Constraints

- Built: search by district/service, district landing pages, tenant white-label site, booking flow (service, barber or "any barber", date, time slot, client data, deposit), realtime availability over WebSocket, anti double-booking, MercadoPago/PayPal/Culqi payment adapters (running in dev simulation until real keys exist), R2 image uploads, tenant admin (agenda with drag and drop, team, schedules), superadmin (tenants, stats), Resend email.
- Planned in this round: promotions and discount codes, post-visit reviews, loyalty points, gift cards, membership plans, services/clients/reports/settings screens in the admin.
- Constraint: automatic WhatsApp messages are disabled for now; only the contact WhatsApp that each shop configures is shown.
- Undecided: SUNAT electronic receipts, custom domains per shop.

## Brand Commitments

- Name: date.pe. Spanish (Peru) copy throughout.
- References the owner made binding: Airbnb, Apple, agentsdatawell.com, datasets.lat. Clean, modern, intuitive, easy to explore.
- Owner rules: no em dashes anywhere, no emoji or odd symbols in text, real icons from an icon library, no AI-writing patterns (see no-ai-slop), purposeful animation, hover states and reveals done well.

## Evidence on Hand

- No real customers, testimonials, ratings or usage numbers yet. Do not invent them.
- Demo tenant "Barbería Juana" (Miraflores) is synthetic seed data; any imagery or names attached to it must be treated as illustrative.
- Competitor research in `docs/investigacion-competencia.md` (Booksy, Fresha, Square, AgendaPro, Reservo, Alaz and others).

## Product Principles

1. The booking is the product: every screen shortens the path from "I need a cut" to a confirmed slot.
2. Local truth over global habit: soles, Yape, WhatsApp, districts of Lima.
3. Each shop owns its brand; date.pe stays in the background on tenant sites.
4. Show real availability and real prices; never fake scarcity or social proof.

## Accessibility & Inclusion

Mobile-first, readable on low-end Android phones and slow connections; keyboard and screen-reader usable forms.
