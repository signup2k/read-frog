---
"@read-frog/extension": patch
---

fix(site-rules): restore article translation on SCMP's redesigned site

SCMP migrated to a Next.js layout using `data-qa` attributes, so the built-in
rule's includeSelectors (`.info__subHeadline`, `.section-content h2`) no longer
matched the article body and the whole article was excluded from translation.
Add the new `ContentBody`/`ContentSubHeadline`/`ContentHeadline` container
selectors while keeping the old classes for legacy pages.
