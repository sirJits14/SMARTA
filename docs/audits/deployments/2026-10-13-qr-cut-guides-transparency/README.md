# Production deployment: lighter QR cutting guides

On October 13, 2026 the user requested 70% transparency for the dashed QR cutting lines. Commit `165dd5f` was pushed to `origin/master`.

The printed border now uses `rgba(119, 119, 119, 0.3)`: 30% opacity, or 70% transparency. Only the border color has transparency; QR codes and student details retain full opacity.

The production release tree from `../2026-10-13-qr-cut-guides` was reused. Its 54 build files matched live production before the refinement, and the live index was checked again immediately before publication. After rebuilding, only the shared QR print chunk changed in content, with other differences limited to hashed asset references.

Verification: all 465 unit tests passed; browser print checks confirmed the border alpha and fully opaque cards/QR images, touching edges, 16 mm QR dimensions and expected page counts for 1, 8, 9, 79, 80, 81 and 160 cards. The release wrapper's verification and production build passed.

The hosting-only release succeeded at https://bnhs-sims.web.app. All 54 served files matched the deployed build by SHA-256; see `hosting-verification.json`. The deployed main script is `/assets/index-BZpKYIEs.js`. Physical printer output has not been checked in this session.

Future releases from the separate production tree must preserve the earlier overlays documented in the preceding deployment record, the `f0f5b17` cutting-guide patch, and this `165dd5f` transparency patch. To roll back the transparency change, restore the preceding SIMS Hosting version. No data migration is required.
