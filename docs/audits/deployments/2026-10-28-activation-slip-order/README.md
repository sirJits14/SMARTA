# Production deployment: activation-slip roster order

On October 28, 2026, the user requested merge, push and deployment of activation-slip ordering. Source commit `20c4b253036f8366f28f5d63a41fecb0eba1dc03` was fast-forwarded to `origin/master` and deployed to `issueActivationCodesFn` only. ID-card section and saved-batch printing already use male-first, female-next order by last name and first name within each section.

The callable returns issued slips in that same order. Students with an unrecognized or missing sex follow the male and female groups; no slip is dropped. Issuance eligibility, codes and print layout are unchanged.

Verification: 773 SIMS tests and 169 Functions unit tests passed. The Firestore emulator issuance-order regression passed. Before deployment, the production function's issuance implementation was compared with the merged source; its issuance logic matched apart from this change. Firebase reported a successful update, and Cloud Functions reported revision `issueactivationcodesfn-00019-liy` ACTIVE on Node.js 22 in `asia-southeast1`. The deployed source archive's handler, sorting helper, callable wrapper and entrypoint matched the source files byte for byte. The prior revision was `issueactivationcodesfn-00018-dit`.

Only `functions:issueActivationCodesFn` was deployed; no hosting, rules, indexes or other functions were published. An authenticated production issuance and physical print were not performed.
