# BNHS SIMS registrar design system

The authenticated registrar interface uses frosted navigation and summary panels over a static lavender, blush and blue background. Tables, forms and dialogs have calm, nearly opaque surfaces. The dashboard puts unassigned learners and sections without attendance records ahead of supporting totals and charts.

## Scope and source
Nine destinations: Dashboard, Students, Sections, Schedules, Enrollment, Attendance, ID Cards, Guardians and Settings. Guardians retains all eight lazy panels. The school seal and Inter remain the brand anchors. Login, parent portal, kiosk, backend permissions, print sheet dimensions and SF2 calculations are outside this redesign.

Approved specification: [registrar glassmorphism](docs/superpowers/specs/2026-09-25-sims-glassmorphism-redesign-design.md).
Screen tokens: `src/registrar.css`. Legacy `src/styles.js` tokens provide login and print fallbacks.

## Materials and colors
| Role | Fill | Blur | Radius |
| --- | --- | --- | --- |
| Navigation | White at 76% | 18px | 24px |
| Summary | White at 82% | 12px | 24px |
| Working | White at 97% | None | 16px |
| Dialog | White | None | 20px |
| Input/select | White | None | 12px |

Background: #f1eff5 with static #f0d9de, #dcebf1 and #e6dff4 radial gradients.
Primary #5b4fe8; focus #4638c2; screen ink #25213b; muted #656078.
Control border #8c869a. Decorative borders can remain lighter.
Attendance colors retain Present #15803d, Late #b45309, Absent/error #dc2626, Excused #64748b, with text labels rather than color alone.

Glass panels use a thin white edge and a restrained cool shadow. Blur is confined to navigation and summary panels; never apply it to individual table rows or form fields.

## Layout and type
Desktop sidebar: 232px expanded / 72px collapsed, with saved preference and accessible icon labels. Outer spacing/gap: 24px; 16px below 1024px; 12px outer spacing below 768px. Below 768px, navigation becomes a modal drawer and working forms stack. Main content scrolls independently. Dense tables scroll inside named regions.
Dashboard pairs become one column at 1100px; totals stack below 768px.

Inter/system sans; body controls 14px, secondary data/captions 11–13px, dashboard heading 26px (23px mobile), prominent metrics 30–48px. Numeric data uses tabular figures. Shared actions and fields have 44px minimum hit areas. Keep visible labels, deliberate spacing and a strong focus outline.

## Interaction and information
The sidebar preserves an active attendance session when selected again. Explicit dashboard attendance shortcuts validate the section, school year and date. Coverage means distinct eligible sections with a saved record; an empty marks map counts, kiosk records count, and no eligible sections displays text instead of a misleading percentage.

Loading, errors and empty results are distinct. Retry preserves query context. Modal drafts stay mounted through resource errors; dependent controls disable until recovery. Save operations guard repeat activation and retain errors. Native dialogs handle Escape, focus containment and focus restoration. Guardians panels support Arrow/Home/End navigation.

## Fallbacks and print
Unsupported backdrop filters and reduced transparency use white surfaces. Reduced motion suppresses animation/transitions. Registrar atmosphere is screen scoped. Printable components and page layouts retain their existing styles; print controls wait for the currently mounted QR images to load. Production printer/export verification remains a rollout check, as documented in the verification record.

## Verification and remaining polish
[Verification record](docs/superpowers/reviews/2026-09-25-sims-glassmorphism-verification.md) distinguishes synthetic checks from live integration. Deferred polish: filtered learner empty copy, attendance mode selection semantics, and opaque sticky summary headers. This document describes implemented behavior without claiming those gaps are resolved.
