# Recent enrolled sections dashboard card

## Intent

Help staff identify sections with recent enrollment activity when deciding which sections need printing.

## Design

Add a dashboard card listing up to five sections, expandable to the 30 most recently enrolled sections with current-school-year enrolled learners, ordered by their most recent enrollment date. Show the grade and section, the latest enrollment date, and the total currently enrolled learners in each section. Follow the dashboard's existing role-based grade scope and card styling. Show an empty state when there are no enrolled sections. Keep the existing recent learner enrollments card.

## Approaches

- **Recent activity list (selected):** derive the card from existing enrollment records. It is a simple reference for staff and requires no new stored state.
- **Print-tracking list:** add printed status and a marking workflow. This provides explicit tracking but adds state and was not selected.

The card is an activity reference; it does not determine whether a section has been printed or add a print action. Handle missing enrollment dates and unavailable sections safely, and retain existing access restrictions.
