/**
 * Article-mode translation-root detection (self-implemented, no third-party libs).
 *
 * `article` translate range should translate only the main prose of a page and
 * skip navigation, recommended-article lists and sidebars that live outside it.
 * We choose a translation root and let the walker descend from it.
 *
 * Strategy:
 *  1. Prefer a semantic `<article>`/`<main>` element (O(1)) — the vast majority
 *     of article pages expose one of these.
 *  2. When none exists, score candidate containers by text density with a
 *     link-density penalty and pick the highest-scoring container.
 *  3. Fall back to `null` (the caller falls back to its existing body walk).
 *
 * Read-only: this never moves, deletes or mutates any node — it only inspects
 * the document and returns a real HTMLElement reference.
 */

/**
 * Class/id names that mark non-prose anchors (footers, menus, related/sidebar
 * rails, social widgets, sponsors, pagination, breadcrumbs).
 */
const UNLIKELY_CLASS_ID_RE =
  /\b(comment|footer|menu|related|sidebar|social|sponsor|nav|breadcrumb|pagination)\b/i

/** Minimum character count for a container to be a plausible main-content root. */
const MIN_CONTENT_LENGTH = 200

/** A container whose link text exceeds this share of its text is deemed non-prose. */
const MAX_LINK_DENSITY = 0.25

function isUnlikelyCandidate(element: HTMLElement): boolean {
  const id = element.id
  const className = typeof element.className === "string" ? element.className : ""
  return UNLIKELY_CLASS_ID_RE.test(id) || UNLIKELY_CLASS_ID_RE.test(className)
}

interface TextStats {
  textLength: number
  linkLength: number
}

function measureTextStats(element: HTMLElement): TextStats {
  const textLength = element.textContent?.length ?? 0
  let linkLength = 0
  for (const anchor of element.querySelectorAll("a")) {
    linkLength += anchor.textContent?.length ?? 0
  }
  return { textLength, linkLength }
}

export function findMainContentContainer(document: Document): HTMLElement | null {
  // 1. Semantic tags first.
  const semantic = document.querySelector("article, main")
  if (semantic instanceof HTMLElement) {
    return semantic
  }

  // 2. Text-density fallback (only runs on pages without <article>/<main>).
  const body = document.body
  if (!body) return null

  const candidates = body.querySelectorAll("article, section, div, p")
  let best: HTMLElement | null = null
  let bestScore = 0

  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue
    if (isUnlikelyCandidate(el)) continue

    const { textLength, linkLength } = measureTextStats(el)
    if (textLength < MIN_CONTENT_LENGTH) continue

    const linkDensity = textLength > 0 ? linkLength / textLength : 0
    if (linkDensity > MAX_LINK_DENSITY) continue

    // The text-length term is capped at 3 so a focused prose block (low link
    // density) can beat a giant wrapper that is mostly links.
    const score = 1 + Math.min(Math.floor(textLength / 100), 3) - linkDensity
    if (score > bestScore) {
      bestScore = score
      best = el
    }
  }

  return best
}
