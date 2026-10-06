# Section Bevel Button — Design

Date: 2026-10-05
Status: Approved (brainstorming session)

## Goal

On the Sections page, show each section name as a raised, pressable button
instead of an underlined link. Today the name is a `<button>` styled like a
hyperlink (`.sims-section-link`), which reads as a URL rather than a control.

## Decisions

| Question | Decision |
|---|---|
| Where | Sections page table only (`SectionsPage.jsx`); no other screens |
| Style | "Soft raised": pale teal gradient, light top edge, soft drop shadow |
| Row click | Whole row stays clickable and opens section details, as today |
| Width | Every button fills the Section column, with a `›` arrow on the right |
| Approach | Restyle the existing `.sims-section-link` class; no new shared component |

## Changes

### `src/pages/SectionsPage.jsx`

In the Section cell (currently line 191), change the button's children from
`{s.name}` to two spans:

```jsx
<span>{s.name}</span><span aria-hidden="true">›</span>
```

Keep everything else on the button: `className="sims-section-link"`, the
`aria-label` ``View ${s.name} section details``, and the `onClick` that calls
`event.stopPropagation()` then `setDetailSection(s)`. The row's own `onClick`
is unchanged.

### `src/registrar.css`

Replace the `.sims-section-link` rule (currently line 146, inside
`@media screen`) with the soft-raised style:

| Property | Value |
|---|---|
| Layout | `display:flex; justify-content:space-between; align-items:center; gap:12px` |
| Size | `width:100%; min-width:160px; min-height:44px; box-sizing:border-box; padding:9px 16px` |
| Text | `font:inherit; font-weight:600; color:#154854; text-align:left; text-decoration:none; overflow-wrap:anywhere` |
| Shape | `border:1px solid #b9dcd7; border-radius:10px` |
| Fill | `background:linear-gradient(#f3fbfa,#dff1ee)` |
| Depth | `box-shadow:inset 0 1px 0 #fff, 0 2px 0 #b9dcd7, 0 3px 6px rgba(21,72,84,.12)` |
| Motion | `transition:transform 80ms ease-out, box-shadow 80ms ease-out; cursor:pointer` |

States:

- **Hover:** `background:linear-gradient(#f7fdfc,#e6f5f2)`.
- **Active (pressed):** `transform:translateY(2px); box-shadow:inset 0 2px 3px rgba(21,72,84,.15), 0 0 0 #b9dcd7`.
- **Arrow** (the second span): `color:#007a72; flex-shrink:0`.
- **Focus:** no new rule. The global `.sims-ui :focus-visible` outline applies.
- **Reduced motion:** no new rule. The global reduced-motion rule in `App.jsx`
  removes the transition; the pressed position still shows.

Long names wrap inside the button (`overflow-wrap:anywhere`) instead of
widening the column. The table already sits in `.sims-table-scroll`, so the
160px minimum never causes page-level horizontal scroll on phones.

## Unchanged

- Edit and Delete buttons in the same row.
- Printing: the rule stays inside `@media screen`.
- The screen-reader name, so both browser tests in
  `tests/browser/registrar-recovery.jsx` that query
  `button[aria-label="View Acacia section details"]` keep working.

## Testing

1. Run the browser tests in `tests/browser/registrar-recovery.jsx`; the two
   section-detail tests must still pass.
2. Open the Sections page in the app and check:
   - the buttons line up at equal width with the `›` on the right;
   - hover lightens the button and pressing sinks it;
   - Tab shows the focus outline and Enter opens section details;
   - clicking elsewhere on the row still opens section details;
   - a long section name wraps inside its button;
   - at 375px width the page does not scroll sideways.

## Out of scope

- Section lists on other screens (ID Cards "By section" tab, pickers).
- A reusable beveled variant of the shared `Btn` component.
