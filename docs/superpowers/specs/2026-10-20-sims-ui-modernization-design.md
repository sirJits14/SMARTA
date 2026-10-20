# SIMS UI modernization

Date: 2026-10-20. Supersedes the visual direction of
[2026-09-25 registrar glassmorphism](2026-09-25-sims-glassmorphism-redesign-design.md)
and the palette values of [2026-10-06 dark mode](2026-10-06-dark-mode-design.md)
(the theme mechanism from that spec is unchanged).

## Goal

Restyle SIMS and the Parents App as a modern, minimal SaaS dashboard with full light and
dark themes, modeled on a dark management-dashboard reference (charcoal-navy surfaces,
hairline borders, teal accent). UI only: routes, Firestore queries, permissions,
validation, calculations and print layouts are unchanged.

## Decisions (confirmed with the project owner)

| Topic | Decision |
| --- | --- |
| Font | SF Pro rendered natively on Apple devices (system stack), Inter fallback elsewhere. SF Pro files are not bundled, because Apple's license limits it to Apple platforms. A machine with SF Pro installed locally uses it by name. |
| Material | Glassmorphism fully replaced: flat surfaces, 1px borders, no blur or background glows. |
| Parents App | Same tokens, font, buttons, cards and inputs; keeps its floating pill nav and screen layouts; restrained, at most one subtle teal accent on the main action. |
| Sidebar | SMARTA wordmark on top; account row (avatar, name, role) at the bottom opening a menu with Appearance (Auto / Light / Dark) and Sign out. |
| Quick search | Not in scope (would be new functionality). |
| Header | Separate top bar removed. Inline page header: breadcrumb + SY chip row, then title + actions with a hairline. Slim sticky bar on mobile. |
| Edge screens | SIMS Login and Change password restyled; Parents App sign-in/verify/consent/join restyled in the Parents App phase; kiosk unchanged. |
| Palette | The supplied hexes, with two light-mode text tokens deepened for WCAG AA on #F5F7FA: primary #087F8C becomes #077683 (#087F8C kept for charts) and muted #66758A becomes #5F6E83. Dark primary buttons use near-black text (#061418), because white on #24A9B5 is 2.8:1. |

## Delivery

1. **Foundation and shell** (this phase): tokens and font stack, buttons (primary, secondary, danger, quiet, icon; hover, focus, active, disabled, loading), fields, cards, dialogs, sidebar and account menu, inline page header, mobile bar and drawer, Login and Change password, DESIGN.md.
2. **SIMS modules**: tables with ⋯ row menus, stat cards, tabs, dropdowns, empty and loading states, applied across every page; replace remaining inline styles that fight the tokens.
3. **Parents App**: shared components and the sign-in flows, retiring its glass layer.

Each phase ships as its own PR. SIMS hosting deploys from the release tree, so each SIMS
phase is ported there through the usual release flow before going live.

## Non-goals

No new features, no data or schema changes, no new UI dependencies, no changes to printed
documents.
