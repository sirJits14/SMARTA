# Logo Refresh (SMARTA) — Design

Date: 2026-10-05
Status: Approved (brainstorming session)

## Goal

Replace the old teal/navy S (`src/assets/sims-logo.png`) and the parent
portal's school-seal icons with the new SMARTA artwork:

| Source file (2000×2000, transparent RGBA) | Used for |
|---|---|
| `PHONE APP.png` — teal ribbon S | Parents App (all icons) |
| `Dashboard APP.png` — white ribbon S | SIMS App browser-tab icon |
| `Project Name.png` — teal S + "SMARTA" wordmark + tagline | SIMS App sidebar, Login, Change Password |

## Decisions

| Question | Decision |
|---|---|
| SIMS "tab bar" | The browser-tab favicon |
| White S on light tabs | Put it on a dark rounded tile so it shows on light and dark tabs |
| Sidebar, expanded | Cropped wordmark replaces both the S icon and the "BNHS SIMS / Learner records" text |
| Sidebar, collapsed | Only the teal S (the standalone S from `PHONE APP.png`) |
| Login | Wordmark replaces the old icon and the "BNHS SIMS" heading; "Staff sign-in" stays |
| Change Password | Wordmark replaces the old icon; "Set a new password" heading stays |
| Parents home-screen icon | Teal S on white |
| How assets are made | A one-off Python/Pillow script produces trimmed, resized PNGs; only small outputs ship |

## Source files

The three sources are untracked in the main checkout's `src/assets/`. Copy them
into the repo at `design/logos/` (outside `src/`, so Vite never bundles them),
with these names:

- `design/logos/phone-app.png` ← `PHONE APP.png`
- `design/logos/dashboard-app.png` ← `Dashboard APP.png`
- `design/logos/project-name.png` ← `Project Name.png`

That adds about 2.1 MB to the repo, and anyone can regenerate the outputs.
The other untracked files in the main checkout (`KIOSK.png`, `OFFICIAL LOGO.png`,
the `.zip`, `OLD/`, etc.) are not touched.

## Generator: `scripts/build-logos.py`

A standalone Pillow script, run by hand (`python scripts/build-logos.py`) from
the repo root. It reads `design/logos/` and writes the outputs below. Each output
is trimmed to the alpha bounding box first (`getchannel('A').getbbox()`), then
resized with LANCZOS and saved as optimized PNG. It's not part of `npm run build`.

### SIMS outputs (`src/assets/`)

| File | Size | Recipe |
|---|---|---|
| `sims-favicon.png` | 64×64 | Rounded square, fill `#12313a` (sidebar ink), radius 14px; trimmed white S fit inside a 48×48 centered box |
| `smarta-wordmark.png` | 480px wide, height from aspect (~142px) | `project-name.png` trimmed to its alpha bbox (≈1844×545) |
| `smarta-mark.png` | 64×64 | Trimmed teal S from `phone-app.png`, fit into a transparent 64×64 square, centered |

The collapsed mark uses the standalone teal S, not a crop of the wordmark. In
the wordmark the "M" overlaps the S, so a crop leaves a flat notch on the S's
right edge (found while prototyping). It's the same ribbon S artwork, just not clipped.

### Parents outputs (`parent/public/icons/`, same names, overwritten)

| File | Size | Recipe |
|---|---|---|
| `icon-192.png` | 192×192 | White background; trimmed teal S fit inside the middle 80% (154px box), centered |
| `icon-512.png` | 512×512 | Same as above at 512 (410px box) |
| `icon-maskable-512.png` | 512×512 | White background; S fit inside the middle 60% (307px box) so circle/squircle masks don't clip it |

Opaque white backgrounds (not transparent) mean iOS "Add to Home Screen"
won't fill the corners with black.

## Code changes

### `index.html`

Line 7: `href="/src/assets/sims-logo.png"` → `href="/src/assets/sims-favicon.png"`.

### `src/components/Shell.jsx`

Import `smartaWordmark` and `smartaMark` instead of `simsLogo`. Replace the brand
block (line 31–32) with:

```jsx
<div className="sims-brand">{collapsed
  ? <img src={smartaMark} alt="SMARTA" width="32" height="32" />
  : <img className="sims-wordmark" src={smartaWordmark} alt="SMARTA" width="188" height="56" />}</div>
```

### `src/registrar.css`

- Remove the now-unused `.sims-brand strong` and `.sims-brand small` rules (lines 21–22).
- Add `.sims-ui .sims-wordmark { display:block; width:100%; max-width:188px; height:auto; }`.
  188px is the space inside the expanded sidebar: 232 − 2×14 sidebar padding − 2×8 brand padding.
- Check the mobile layout (`@media` at line 65) still fits the wordmark; cap it
  there with `max-width` if not.

### `src/components/Login.jsx`

Import `smartaWordmark` instead of `simsLogo`. Replace the `<img>` (line 24) and the
`<h1>BNHS SIMS</h1>` (line 25) with one heading that holds the image, so the
page keeps its `h1`:

```jsx
<h1 style={{ margin: '0 0 6px', lineHeight: 0 }}><img src={smartaWordmark} alt="SMARTA" width={240} height={71} style={{ display: 'block' }} /></h1>
```

Keep the "Staff sign-in" paragraph as it is. The image stays left-aligned,
like the old icon and the card's text.

### `src/components/ChangePassword.jsx`

Import `smartaWordmark` instead of `simsLogo`. Swap the `<img>` (line 35) for the
wordmark: `alt="SMARTA"`, `width={200} height={59}`, same `marginBottom: 16`.
The heading doesn't change.

### Cleanup

- Delete `src/assets/sims-logo.png` once a grep confirms no references are left.
- `DESIGN.md` line 6: change "The SIMS logo (`src/assets/sims-logo.png`, also the
  favicon)" to "The SMARTA wordmark (`src/assets/smarta-wordmark.png`; S mark and
  dark-tile favicon alongside)".

### Parents App

No code changes. `Home.jsx`, `SignIn.jsx`, `index.html` and
`manifest.webmanifest` already point at `/icons/icon-192.png` and friends.
The `theme-color` `#00A79D` and the app names stay as they are.

## Out of scope

Kiosk app and `KIOSK.png`; app names and titles ("BNHS SIMS" in `<title>`,
"BukNHS SMARTA" in the parent manifest); the parent theme color; the ID card
and print layouts.

## Testing

- `npm test` and `npm --prefix parent test` pass. No existing test asserts on
  the old logo, its alt text, or the "BNHS SIMS" heading.
- Visual check in the in-app browser (dev servers for both apps):
  - SIMS: favicon readable on the tab; sidebar wordmark expanded; S mark
    collapsed; mobile width; Login; Change Password.
  - Parents: favicon; Sign-in; Home header.
- Show the user the generated PNGs before committing them.
