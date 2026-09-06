import type { Config } from "@/types/config/config"
import type { TranslationMode } from "@/types/config/translate"
import type { TransNode } from "@/types/dom"
import { resolveProviderConfig } from "@/utils/constants/feature-providers"
import { logger } from "@/utils/logger"
import { isTranslationCancelledError } from "@/utils/request/cancellation"
import {
  CONTENT_WRAPPER_CLASS,
  NOTRANSLATE_CLASS,
  TRANSLATION_ERROR_CONTAINER_CLASS,
  TRANSLATION_MODE_ATTRIBUTE,
  TRANSLATION_ONLY_ATTRIBUTE,
  VIRTUAL_PARAGRAPH_ATTRIBUTE,
  WALKED_ATTRIBUTE,
} from "../../../constants/dom-labels"
import { batchDOMOperation } from "../../dom/batch-dom"
import { isBlockTransNode, isHTMLElement, isTextNode, isTransNode } from "../../dom/filter"
import { unwrapDeepestOnlyHTMLChild } from "../../dom/find"
import { getOwnerDocument } from "../../dom/node"
import { extractTextContent } from "../../dom/traversal"
import {
  buildVirtualParagraphPlan,
  moveParagraphInsertionBoundaryAfterTrailingInlineImages,
  type VirtualParagraphUnit,
} from "../dom/paragraph-segmentation"
import {
  disposeVirtualParagraphGroup,
  dropTranslationOnlySwapRecordsForNodes,
  dropVirtualParagraphWrapper,
  removeOrphanVirtualParagraphWrappers,
  removeTranslatedWrapperWithRestore,
  replayTranslationOnlySwapsForAnchor,
  restoreTranslationOnlySwapsForAnchor,
} from "../dom/translation-cleanup"
import {
  protectTranslationHtmlAttributes,
  type ProtectedTranslationHtml,
} from "../dom/translation-html-attributes"
import { insertTranslatedNodeIntoWrapper } from "../dom/translation-insertion"
import {
  applyInPlaceTextSwap,
  planInPlaceTextSwap,
  snapshotSourceTextNodes,
  verifySourceSnapshot,
} from "../dom/translation-text-swap"
import { findPreviousTranslatedWrapperInside } from "../dom/translation-wrapper"
import { insertVirtualParagraphWrappers } from "../dom/virtual-paragraph-insertion"
import { shouldFilterSmallParagraph } from "../filter-small-paragraph"
import { isHtmlAttributeMarkerIntegrityError } from "../html-attribute-markers"
import { shouldSkipAsTargetLanguage } from "../target-language-skip"
import { normalizeForComparison } from "../text-preparation"
import { translateTextForPage } from "../translate-variants"
import { setTranslationDirAndLang } from "../translation-attributes"
import { getPageTranslationSessionId } from "../translation-session"
import {
  cancelSpinnerAnimation,
  createSpinnerInside,
  getTranslatedTextAndRemoveSpinner,
} from "../ui/spinner"
import { isNumericContent } from "../ui/translation-utils"
import {
  attachBilingualTranslationWrapper,
  collectSourceTextExcludingWrappers,
  dropTranslationOnlySwapRecords,
  getBilingualTranslationStateForSource,
  getTranslationOnlyAnchorState,
  getVirtualParagraphGroupForSource,
  isBilingualTranslationStateCurrent,
  isTranslationOnlySwapRecordCurrent,
  isVirtualParagraphGroupCurrent,
  markExtensionDrivenCharacterData,
  markExtensionDrivenNodeRemoval,
  markVirtualParagraphGroupInserted,
  refreshTranslationOnlySwapRecordExpectedText,
  registerBilingualTranslationState,
  registerTranslationOnlyAnchorState,
  registerTranslationOnlyOriginals,
  registerVirtualParagraphGroup,
  registerVirtualParagraphWrapper,
  swapRecordIntersectsNodes,
  translatingNodes,
  unregisterBilingualTranslationState,
  type BilingualTranslationState,
  type TranslationOnlySwapItem,
  type TranslationOnlySwapRecord,
  type VirtualParagraphGroup,
  type VirtualParagraphSourceSnapshot,
} from "./translation-state"

let virtualParagraphGroupSequence = 0
const unsupportedDeepLXHtmlAttributeProviders = new Set<string>()
const supportedDeepLXHtmlAttributeProviders = new Set<string>()
type DeepLXHtmlAttributeProbeResult = "supported" | "unsupported" | "unknown"
interface DeepLXHtmlAttributeProbe {
  promise: Promise<DeepLXHtmlAttributeProbeResult>
  resolve: (result: DeepLXHtmlAttributeProbeResult) => void
}
const deepLXHtmlAttributeProbes = new Map<string, DeepLXHtmlAttributeProbe>()

function createDeepLXHtmlAttributeProbe(): DeepLXHtmlAttributeProbe {
  let resolve!: (result: DeepLXHtmlAttributeProbeResult) => void
  const promise = new Promise<DeepLXHtmlAttributeProbeResult>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function finishDeepLXHtmlAttributeProbe(
  providerKey: string,
  probe: DeepLXHtmlAttributeProbe | undefined,
  result: DeepLXHtmlAttributeProbeResult,
): void {
  if (!probe || deepLXHtmlAttributeProbes.get(providerKey) !== probe) return
  deepLXHtmlAttributeProbes.delete(providerKey)
  probe.resolve(result)
}

async function acquireDeepLXHtmlAttributeProbe(providerKey: string): Promise<{
  probe?: DeepLXHtmlAttributeProbe
  useLegacy: boolean
}> {
  while (true) {
    if (unsupportedDeepLXHtmlAttributeProviders.has(providerKey)) {
      return { useLegacy: true }
    }
    if (supportedDeepLXHtmlAttributeProviders.has(providerKey)) {
      return { useLegacy: false }
    }

    const activeProbe = deepLXHtmlAttributeProbes.get(providerKey)
    if (!activeProbe) {
      const probe = createDeepLXHtmlAttributeProbe()
      deepLXHtmlAttributeProbes.set(providerKey, probe)
      return { probe, useLegacy: false }
    }

    // An empty/skipped request or a transient error proves neither support nor
    // incompatibility. Re-enter the loop so exactly one waiter owns the next probe.
    await activeProbe.promise
  }
}

function getDeepLXHtmlAttributeProviderKey(config: Config): string | undefined {
  const providerConfig = resolveProviderConfig(config, "translate")
  if (providerConfig.provider !== "deeplx") return undefined
  return `${providerConfig.id}:${providerConfig.baseURL ?? ""}`
}

/**
 * Translate protected markup and restore the attributes that providers are not
 * allowed to rewrite. Both translation modes use this path so DeepLX probing,
 * marker validation, and the legacy fallback cannot drift apart.
 */
async function translateProtectedHtml(
  protectedHtml: ProtectedTranslationHtml,
  config: Config,
): Promise<string> {
  const deepLXProviderKey = getDeepLXHtmlAttributeProviderKey(config)
  const translateLegacyHtml = async () => {
    const translatedHtml = await translateTextForPage(protectedHtml.legacyRequestHtml, "html")
    return translatedHtml ? protectedHtml.restoreLegacy(translatedHtml) : translatedHtml
  }

  if (!protectedHtml.hasPlaceholders) return translateLegacyHtml()

  let ownedDeepLXProbe: DeepLXHtmlAttributeProbe | undefined
  if (deepLXProviderKey) {
    const probeDecision = await acquireDeepLXHtmlAttributeProbe(deepLXProviderKey)
    if (probeDecision.useLegacy) return translateLegacyHtml()
    ownedDeepLXProbe = probeDecision.probe
  }

  try {
    const translatedHtml = await translateTextForPage(protectedHtml.requestHtml, "html")
    if (!translatedHtml) {
      if (deepLXProviderKey) {
        finishDeepLXHtmlAttributeProbe(deepLXProviderKey, ownedDeepLXProbe, "unknown")
      }
      return translatedHtml
    }

    const restoredHtml = protectedHtml.restore(translatedHtml)
    if (deepLXProviderKey) {
      supportedDeepLXHtmlAttributeProviders.add(deepLXProviderKey)
      finishDeepLXHtmlAttributeProbe(deepLXProviderKey, ownedDeepLXProbe, "supported")
    }
    return restoredHtml
  } catch (error) {
    if (!isHtmlAttributeMarkerIntegrityError(error)) {
      if (deepLXProviderKey) {
        finishDeepLXHtmlAttributeProbe(deepLXProviderKey, ownedDeepLXProbe, "unknown")
      }
      throw error
    }

    if (deepLXProviderKey) {
      unsupportedDeepLXHtmlAttributeProviders.add(deepLXProviderKey)
      supportedDeepLXHtmlAttributeProviders.delete(deepLXProviderKey)
      finishDeepLXHtmlAttributeProbe(deepLXProviderKey, ownedDeepLXProbe, "unsupported")
    }
    logger.warn("HTML attribute placeholders were not preserved; retrying full HTML", error)
    return translateLegacyHtml()
  }
}

function getDisplayTranslation(
  sourceText: string,
  translatedText: string | undefined,
  comparisonText: string | undefined = translatedText,
) {
  if (translatedText === undefined) {
    return undefined
  }

  // comparisonText lets the HTML-marker path (#1832) compare a normalized
  // variant while the raw translatedText is what gets displayed; the folding
  // normalization (#1835) applies on top for both paths.
  return normalizeForComparison(sourceText) === normalizeForComparison(comparisonText)
    ? ""
    : translatedText
}

function createBilingualWrapper(
  ownerDoc: Document,
  walkId: string,
  config: Config,
  virtualParagraphId?: string,
): { spinner: HTMLElement; wrapper: HTMLElement } {
  const wrapper = ownerDoc.createElement("span")
  wrapper.className = `${NOTRANSLATE_CLASS} ${CONTENT_WRAPPER_CLASS}`
  wrapper.setAttribute(TRANSLATION_MODE_ATTRIBUTE, "bilingual" satisfies TranslationMode)
  wrapper.setAttribute(WALKED_ATTRIBUTE, walkId)
  if (virtualParagraphId) {
    wrapper.setAttribute(VIRTUAL_PARAGRAPH_ATTRIBUTE, virtualParagraphId)
  }
  setTranslationDirAndLang(wrapper, config)
  return { spinner: createSpinnerInside(wrapper), wrapper }
}

async function filterVirtualParagraphUnits(
  units: VirtualParagraphUnit[],
  config: Config,
): Promise<VirtualParagraphUnit[]> {
  const included = await Promise.all(
    units.map(async (unit) => {
      if (isNumericContent(unit.text)) return false
      if (await shouldFilterSmallParagraph(unit.text, config)) return false
      return !(await shouldSkipAsTargetLanguage(unit.text, config))
    }),
  )
  return units.filter((_, index) => included[index])
}

async function translateVirtualParagraph(
  entry: ReturnType<typeof insertVirtualParagraphWrappers>["inserted"][number],
  spinner: HTMLElement,
  group: VirtualParagraphGroup,
  nodes: ChildNode[],
  config: Config,
  forceBlockTranslation: boolean,
): Promise<void> {
  const { flowSource, unit, wrapper } = entry
  const isCurrent = () => isVirtualParagraphGroupCurrent(group, wrapper)
  if (!isCurrent()) return

  const realTranslatedText = await getTranslatedTextAndRemoveSpinner(
    nodes,
    unit.text,
    spinner,
    wrapper,
    isCurrent,
  )
  if (!isCurrent()) {
    disposeVirtualParagraphGroup(group)
    return
  }

  const translatedText = getDisplayTranslation(unit.text, realTranslatedText)
  if (translatedText === "") {
    dropVirtualParagraphWrapper(group, wrapper)
    return
  }
  if (translatedText === undefined) {
    if (!wrapper.querySelector(`.${TRANSLATION_ERROR_CONTAINER_CLASS}`)) {
      dropVirtualParagraphWrapper(group, wrapper)
    }
    return
  }

  await insertTranslatedNodeIntoWrapper(
    wrapper,
    { flowSource, isCurrent, layoutSource: group.layoutSource, sourceText: unit.text },
    translatedText,
    "plain",
    config.translate.translationNodeStyle,
    config,
    forceBlockTranslation,
  )
  if (!isCurrent()) disposeVirtualParagraphGroup(group)
}

async function translateVirtualParagraphs(
  nodes: ChildNode[],
  units: VirtualParagraphUnit[],
  sourceSnapshots: VirtualParagraphSourceSnapshot[],
  layoutSource: HTMLElement,
  walkId: string,
  config: Config,
  forceBlockTranslation: boolean,
): Promise<void> {
  const group: VirtualParagraphGroup = {
    id: `${walkId}:${virtualParagraphGroupSequence++}`,
    walkId,
    status: "active",
    layoutSource,
    wrappers: new Set(),
    splitRecords: [],
    sourceSnapshots,
    sourceTextContent: collectSourceTextExcludingWrappers(layoutSource),
    wrapperPlacements: new Map(),
  }
  registerVirtualParagraphGroup(group)

  const sourceTextSnapshot = collectSourceTextExcludingWrappers(layoutSource)
  let includedUnits: VirtualParagraphUnit[]
  try {
    includedUnits = await filterVirtualParagraphUnits(units, config)
  } catch (error) {
    disposeVirtualParagraphGroup(group)
    throw error
  }

  if (
    !isVirtualParagraphGroupCurrent(group) ||
    collectSourceTextExcludingWrappers(layoutSource) !== sourceTextSnapshot
  ) {
    disposeVirtualParagraphGroup(group)
    return
  }
  if (includedUnits.length === 0) {
    disposeVirtualParagraphGroup(group)
    return
  }

  const ownerDoc = getOwnerDocument(layoutSource)
  const spinners = new Map<HTMLElement, HTMLElement>()
  const entries = includedUnits.map((unit) => {
    const { spinner, wrapper } = createBilingualWrapper(
      ownerDoc,
      walkId,
      config,
      `${group.id}:${unit.id}`,
    )
    spinners.set(wrapper, spinner)
    registerVirtualParagraphWrapper(group, wrapper)
    return { unit, wrapper }
  })

  let inserted: ReturnType<typeof insertVirtualParagraphWrappers>["inserted"]
  try {
    ;({ inserted } = insertVirtualParagraphWrappers(entries, layoutSource, group.splitRecords))
  } catch (error) {
    disposeVirtualParagraphGroup(group)
    throw error
  }

  markVirtualParagraphGroupInserted(group)
  if (!isVirtualParagraphGroupCurrent(group)) {
    disposeVirtualParagraphGroup(group)
    return
  }

  await Promise.allSettled(
    inserted.map((entry) =>
      translateVirtualParagraph(
        entry,
        spinners.get(entry.wrapper)!,
        group,
        nodes,
        config,
        forceBlockTranslation,
      ),
    ),
  )
}

export async function translateNodes(
  nodes: ChildNode[],
  walkId: string,
  toggle: boolean = false,
  config: Config,
  forceBlockTranslation: boolean = false,
): Promise<void> {
  const translationMode = config.translate.mode
  if (translationMode === "translationOnly") {
    await translateNodeTranslationOnlyMode(nodes, walkId, config, toggle)
  } else if (translationMode === "bilingual") {
    await translateNodesBilingualMode(nodes, walkId, config, toggle, forceBlockTranslation)
  }
}

export async function translateNodesBilingualMode(
  nodes: ChildNode[],
  walkId: string,
  config: Config,
  toggle: boolean = false,
  forceBlockTranslation: boolean = false,
): Promise<void> {
  const transNodes = nodes.filter((node) => isTransNode(node))
  if (transNodes.length === 0) {
    return
  }

  const layoutSource = transNodes.at(-1)!
  const virtualLayoutSource =
    transNodes.length === 1 && isHTMLElement(layoutSource) && isBlockTransNode(layoutSource)
      ? layoutSource
      : undefined

  if (virtualLayoutSource) {
    const existingGroup = getVirtualParagraphGroupForSource(virtualLayoutSource)
    if (existingGroup) {
      const isSameActiveWalk =
        existingGroup.walkId === walkId && isVirtualParagraphGroupCurrent(existingGroup)
      if (!toggle && isSameActiveWalk) return

      disposeVirtualParagraphGroup(existingGroup)
      if (toggle) return

      // A previous generation may still be awaiting its provider. Its group
      // ownership guard prevents stale writes, so the fresh walk can proceed.
      transNodes.forEach((node) => translatingNodes.delete(node))
    } else if (removeOrphanVirtualParagraphWrappers(virtualLayoutSource) && toggle) {
      return
    }
  }

  if (isHTMLElement(layoutSource)) {
    const existingBilingualState = getBilingualTranslationStateForSource(layoutSource)
    if (existingBilingualState) {
      const isSameActiveWalk =
        existingBilingualState.walkId === walkId &&
        isBilingualTranslationStateCurrent(existingBilingualState)
      if (!toggle && isSameActiveWalk) return

      if (existingBilingualState.wrapper) {
        removeTranslatedWrapperWithRestore(existingBilingualState.wrapper)
      } else {
        unregisterBilingualTranslationState(existingBilingualState)
      }
      if (toggle) return
      transNodes.forEach((node) => translatingNodes.delete(node))
    }
  }

  try {
    // prevent duplicate translation
    if (transNodes.every((node) => translatingNodes.has(node))) {
      return
    }
    transNodes.forEach((node) => translatingNodes.add(node))

    if (virtualLayoutSource) {
      const virtualParagraphPlan = buildVirtualParagraphPlan(virtualLayoutSource, config)
      // A segmented wrapper can only carry plain text. If the block contains
      // any descendant element (including links, emphasis, or math markup),
      // use the regular protected-HTML path below so the translated side keeps
      // the original structure. Pure text blocks retain the cheaper segmented
      // insertion path.
      const hasRichStructure = virtualLayoutSource.querySelector("*") !== null
      if (virtualParagraphPlan.units.length >= 2 && !hasRichStructure) {
        // Explicit blank-line boundaries represent block paragraphs even when
        // an individual unit is short enough for the compact-label heuristic.
        await translateVirtualParagraphs(
          nodes,
          virtualParagraphPlan.units,
          virtualParagraphPlan.sourceSnapshots,
          virtualLayoutSource,
          walkId,
          config,
          true,
        )
        return
      }
    }

    const insertionTarget =
      transNodes.length === 1 && isBlockTransNode(layoutSource) && isHTMLElement(layoutSource)
        ? unwrapDeepestOnlyHTMLChild(layoutSource, config)
        : layoutSource

    const existedTranslatedWrapper = findPreviousTranslatedWrapperInside(insertionTarget, walkId)
    if (existedTranslatedWrapper) {
      removeTranslatedWrapperWithRestore(existedTranslatedWrapper)
      if (toggle) {
        return
      }
      nodes.forEach((node) => translatingNodes.delete(node))
      return translateNodesBilingualMode(nodes, walkId, config, toggle, forceBlockTranslation)
    }

    // After a translationOnly session, an in-place-swapped paragraph has no
    // wrapper — only the anchor marker. A bilingual toggle over it must undo
    // the swap (and a bilingual translate must see the original text).
    const swappedAnchor = (
      isHTMLElement(insertionTarget) ? insertionTarget : insertionTarget.parentElement
    )?.closest<HTMLElement>(`[${TRANSLATION_ONLY_ATTRIBUTE}]`)
    if (
      swappedAnchor &&
      restoreTranslationOnlySwapsForAnchor(swappedAnchor, transNodes) &&
      toggle
    ) {
      return
    }

    const sourceTextBeforeFilter = isHTMLElement(layoutSource)
      ? collectSourceTextExcludingWrappers(layoutSource)
      : null
    const textContent = transNodes
      .map((node) => extractTextContent(node, config))
      .join("")
      .trim()
    if (!textContent || isNumericContent(textContent)) return

    let bilingualState: BilingualTranslationState | undefined
    if (isHTMLElement(layoutSource) && sourceTextBeforeFilter !== null) {
      bilingualState = {
        layoutSource,
        sourceTextContent: sourceTextBeforeFilter,
        status: "active",
        walkId,
        wrapper: null,
      }
      registerBilingualTranslationState(bilingualState)
    }

    let shouldFilter: boolean
    try {
      // Target-language skip runs here, BEFORE the wrapper/spinner is inserted,
      // so same-language paragraphs never touch the DOM.
      shouldFilter =
        (await shouldFilterSmallParagraph(textContent, config)) ||
        (await shouldSkipAsTargetLanguage(textContent, config))
    } catch (error) {
      if (bilingualState) unregisterBilingualTranslationState(bilingualState)
      throw error
    }

    if (bilingualState && !isBilingualTranslationStateCurrent(bilingualState)) {
      const shouldRetry =
        getBilingualTranslationStateForSource(layoutSource as HTMLElement) === bilingualState &&
        layoutSource.isConnected
      unregisterBilingualTranslationState(bilingualState)
      if (shouldRetry) {
        nodes.forEach((node) => translatingNodes.delete(node))
        return translateNodesBilingualMode(nodes, walkId, config, toggle, forceBlockTranslation)
      }
      return
    }
    if (shouldFilter) {
      if (bilingualState) unregisterBilingualTranslationState(bilingualState)
      return
    }

    const ownerDoc = getOwnerDocument(insertionTarget)
    // The translated side is rendered inside a span wrapper, so a block
    // trans node's outerHTML would create a nested/repeated block. Match the
    // translationOnly path and serialize the unwrapped insertion target's
    // direct translatable children instead. This snapshot is deliberately
    // taken before adding our wrapper, so extension spinners/wrappers cannot
    // leak into the provider request.
    const protectedSourceNodes: TransNode[] =
      transNodes.length === 1 && isHTMLElement(insertionTarget)
        ? [...insertionTarget.childNodes].filter(isTransNode)
        : transNodes
    if (protectedSourceNodes.length === 0) {
      if (bilingualState) unregisterBilingualTranslationState(bilingualState)
      return
    }
    const protectedHtml = protectTranslationHtmlAttributes(protectedSourceNodes, ownerDoc)
    if (!protectedHtml.sourceHtml) {
      if (bilingualState) unregisterBilingualTranslationState(bilingualState)
      return
    }
    const { spinner, wrapper: translatedWrapperNode } = createBilingualWrapper(
      ownerDoc,
      walkId,
      config,
    )
    let hasTrailingInlineImageAttachment = false

    if (transNodes.length === 1 && isHTMLElement(layoutSource) && isHTMLElement(insertionTarget)) {
      const originalInsertionBoundary = {
        container: insertionTarget,
        offset: insertionTarget.childNodes.length,
      }
      const insertionBoundary = moveParagraphInsertionBoundaryAfterTrailingInlineImages(
        originalInsertionBoundary,
        layoutSource,
      )
      hasTrailingInlineImageAttachment =
        insertionBoundary.container !== originalInsertionBoundary.container ||
        insertionBoundary.offset !== originalInsertionBoundary.offset
      insertionBoundary.container.insertBefore(
        translatedWrapperNode,
        insertionBoundary.container.childNodes[insertionBoundary.offset] ?? null,
      )
    } else if (isTextNode(insertionTarget) || transNodes.length > 1) {
      insertionTarget.parentNode?.insertBefore(translatedWrapperNode, insertionTarget.nextSibling)
    } else {
      insertionTarget.appendChild(translatedWrapperNode)
    }

    if (isHTMLElement(layoutSource) && layoutSource.contains(translatedWrapperNode)) {
      if (bilingualState) {
        attachBilingualTranslationWrapper(bilingualState, translatedWrapperNode)
      }
    } else if (bilingualState) {
      unregisterBilingualTranslationState(bilingualState)
      bilingualState = undefined
    }
    const isCurrent = () =>
      bilingualState
        ? isBilingualTranslationStateCurrent(bilingualState)
        : translatedWrapperNode.isConnected

    const realTranslatedText = await getTranslatedTextAndRemoveSpinner(
      nodes,
      protectedHtml.sourceHtml,
      spinner,
      translatedWrapperNode,
      isCurrent,
      "html",
      () => translateProtectedHtml(protectedHtml, config),
    )

    if (!isCurrent()) {
      removeTranslatedWrapperWithRestore(translatedWrapperNode)
      return
    }

    const translatedText = realTranslatedText
      ? getDisplayTranslation(
          protectedHtml.comparisonSourceHtml,
          realTranslatedText,
          protectedHtml.normalizeForComparison(realTranslatedText),
        )
      : realTranslatedText

    if (translatedText === "") {
      removeTranslatedWrapperWithRestore(translatedWrapperNode)
      return
    }
    if (translatedText === undefined) {
      if (!translatedWrapperNode.querySelector(`.${TRANSLATION_ERROR_CONTAINER_CLASS}`)) {
        removeTranslatedWrapperWithRestore(translatedWrapperNode)
      }
      return
    }

    await insertTranslatedNodeIntoWrapper(
      translatedWrapperNode,
      { flowSource: insertionTarget, isCurrent, layoutSource, sourceText: textContent },
      translatedText,
      "html",
      config.translate.translationNodeStyle,
      config,
      forceBlockTranslation || hasTrailingInlineImageAttachment,
    )
    if (!isCurrent()) removeTranslatedWrapperWithRestore(translatedWrapperNode)
  } finally {
    transNodes.forEach((node) => translatingNodes.delete(node))
  }
}

/**
 * A run's own translationOnly wrapper, scoped to the run: the insertion code
 * only ever places the wrapper as a sibling within the run or appends it into
 * a single-element run, so nested runs' wrappers (a li's inside this run's
 * subtree) are out of reach by construction.
 */
function findRunTranslationOnlyWrapper(
  allChildNodes: ChildNode[],
  walkId: string,
): HTMLElement | null {
  // Any-mode wrapper: a bilingual wrapper here is this run's own previous
  // translation too (node-level translate, then a mode switch, then toggle).
  const isForeignWrapper = (element: HTMLElement) =>
    element.classList.contains(CONTENT_WRAPPER_CLASS) &&
    element.getAttribute(WALKED_ATTRIBUTE) !== walkId

  for (const node of allChildNodes) {
    if (!isHTMLElement(node)) continue
    if (isForeignWrapper(node)) return node
    // Spinner phase of a single-element run: wrapper appended INSIDE it
    for (const child of node.children) {
      if (isHTMLElement(child) && isForeignWrapper(child)) return child
    }
  }
  return null
}

function stageTranslationOnlyDOMOperation(operation: () => void): void {
  // Applied on the next frame via the global batcher — no commitGroup
  // batching, so each paragraph's swap lands as soon as its own translation
  // returns (progressive rendering, not a whole-batch jump). The operation
  // below already removes its wrapper and re-checks source/connectivity.
  batchDOMOperation(operation)
}

// ---------------------------------------------------------------------------
// translationOnly virtual paragraphs
//
// A single walked block element whose text lives in a pre-wrap container
// (x.com's [data-testid="tweetText"] holds a whole multi-paragraph tweet in
// one inline span) reaches translationOnly as ONE run: one provider request,
// one in-place swap, one failure domain. Reuse the bilingual blank-line plan
// so each blank-line-separated paragraph becomes its own request and its own
// slice swap on the site's own text nodes — no splitText, so framework node
// identity is preserved exactly like the whole-run swap.
//
// Scope limits (deliberate, v1):
// - Only runs made of a single block trans node (same gate as bilingual's
//   virtualLayoutSource).
// - Only pure-text plans: units containing atomic fragments (preserveText
//   links, CODE/TIME) fall back to the whole-run path, because a slice swap
//   cannot represent element-owned text.
// ---------------------------------------------------------------------------

interface VirtualSwapNodeState {
  item: TranslationOnlySwapItem
  // Slices already written, in ORIGINAL-stream coordinates. Later slices'
  // offsets shift by the deltas of applied slices that precede them.
  appliedSlices: { start: number; end: number; delta: number }[]
}

async function translateSingleElementVirtualParagraphsTranslationOnly(
  layoutSource: HTMLElement,
  nodes: ChildNode[],
  walkId: string,
  config: Config,
  toggle: boolean,
): Promise<boolean> {
  // In-flight dedup FIRST, matching the generic path: a retranslation attempt
  // that arrives while this run is still awaiting providers must abort BEFORE
  // touching the anchor — the restore below would refresh the record's
  // expected text onto host-diverged content and mask the staleness that the
  // settle-time retry relies on.
  if (nodes.every((node) => translatingNodes.has(node))) return true

  const existingState = getTranslationOnlyAnchorState(layoutSource)
  if (existingState) {
    // Restore first: the segmentation plan must be built from source text,
    // never from our own translations. Retranslation keeps the records so the
    // anchor stays monitored through the provider round-trip.
    const restored = restoreTranslationOnlySwapsForAnchor(
      layoutSource,
      undefined,
      toggle ? undefined : { keepRecords: true },
    )
    if (toggle) return restored
  } else if (toggle) {
    return false
  }

  const plan = buildVirtualParagraphPlan(layoutSource, config)
  if (plan.units.length < 2) return false
  if (plan.units.some((unit) => unit.sourceFragments.some((fragment) => fragment.atomic))) {
    return false
  }

  nodes.forEach((node) => translatingNodes.add(node))

  try {
    const includedUnits = await filterVirtualParagraphUnits(plan.units, config)
    if (includedUnits.length === 0) return true

    // Anchor state is registered BEFORE any request, mirroring bilingual's
    // pre-registered state: a mid-flight host rewrite then flags the record
    // stale and the mutation pipeline retranslates, instead of the paragraph
    // being dropped permanently (translationOnly's gap on highly dynamic
    // pages such as x.com's virtualized timeline).
    const record: TranslationOnlySwapRecord = {
      walkId,
      runNodes: [...nodes],
      expectedRunText: "",
      items: [],
      attributeItems: [],
    }
    const nodeStates = new Map<Text, VirtualSwapNodeState>()
    for (const unit of includedUnits) {
      for (const fragment of unit.sourceFragments) {
        if (!isTextNode(fragment.source)) continue
        if (!nodeStates.has(fragment.source)) {
          const item: TranslationOnlySwapItem = {
            node: fragment.source,
            originalValue: fragment.source.data,
            translatedValue: fragment.source.data,
          }
          record.items.push(item)
          nodeStates.set(fragment.source, { item, appliedSlices: [] })
        }
      }
    }
    if (record.items.length === 0) return true
    refreshTranslationOnlySwapRecordExpectedText(record)

    const anchorState = getTranslationOnlyAnchorState(layoutSource)
    if (anchorState) {
      // This retranslation replaces the kept records covering the same run.
      dropTranslationOnlySwapRecords(
        anchorState,
        anchorState.swaps.filter((existing) =>
          swapRecordIntersectsNodes(existing, record.runNodes),
        ),
      )
      anchorState.swaps.push(record)
    } else {
      const attributeAdjustments = [
        {
          name: TRANSLATION_ONLY_ATTRIBUTE,
          previousValue: layoutSource.getAttribute(TRANSLATION_ONLY_ATTRIBUTE),
        },
        { name: "dir", previousValue: layoutSource.getAttribute("dir") },
        { name: "lang", previousValue: layoutSource.getAttribute("lang") },
      ]
      layoutSource.setAttribute(TRANSLATION_ONLY_ATTRIBUTE, "")
      setTranslationDirAndLang(layoutSource, config)
      registerTranslationOnlyAnchorState({
        anchor: layoutSource,
        attributeAdjustments,
        swaps: [record],
      })
    }

    // One spinner vehicle per element: translationOnly wrappers exist only to
    // show progress and are removed on settle. Per-paragraph spinners would
    // need splitText at paragraph boundaries, which is exactly the framework
    // node-identity break the in-place swap avoids.
    const sessionIdAtEntry = getPageTranslationSessionId() ?? undefined
    const ownerDoc = getOwnerDocument(layoutSource)
    const progressWrapper = ownerDoc.createElement("span")
    progressWrapper.className = `${NOTRANSLATE_CLASS} ${CONTENT_WRAPPER_CLASS}`
    progressWrapper.setAttribute(
      TRANSLATION_MODE_ATTRIBUTE,
      "translationOnly" satisfies TranslationMode,
    )
    progressWrapper.setAttribute(WALKED_ATTRIBUTE, walkId)
    progressWrapper.style.display = "contents"
    setTranslationDirAndLang(progressWrapper, config)
    const spinner = createSpinnerInside(progressWrapper)
    batchDOMOperation(() => {
      if (layoutSource.isConnected) layoutSource.appendChild(progressWrapper)
    })

    const outcomes = await Promise.allSettled(
      includedUnits.map(async (unit): Promise<"applied" | "empty" | "failed"> => {
        let realTranslatedText: string
        try {
          realTranslatedText = await translateTextForPage(unit.text, "plain")
        } catch (error) {
          if (!isTranslationCancelledError(error)) {
            logger.warn("Virtual paragraph translation failed", error)
          }
          return "failed"
        }
        const translatedText = getDisplayTranslation(unit.text, realTranslatedText)
        // "" hides same-language output; undefined means failure. Both leave
        // the unit's slices in the source language.
        if (!translatedText) return "empty"

        batchDOMOperation(() => {
          // Session ended (stop/restart) while this unit was in flight, or a
          // newer segmented run replaced our record — leave the page alone.
          if (getPageTranslationSessionId() !== sessionIdAtEntry) return
          const liveState = getTranslationOnlyAnchorState(layoutSource)
          if (!liveState?.swaps.includes(record)) return

          let appliedAny = false
          unit.sourceFragments.forEach((fragment, fragmentIndex) => {
            if (!isTextNode(fragment.source)) return
            const state = nodeStates.get(fragment.source)
            if (!state) return
            const { item, appliedSlices } = state
            const node = fragment.source
            if (!node.isConnected) return
            // The host rewrote this node since our last write: host content
            // wins; the registered anchor reads as stale and retranslates.
            if (node.data !== item.translatedValue) return
            const sliceLength = fragment.endOffset - fragment.startOffset
            const shift = appliedSlices
              .filter((slice) => slice.end <= fragment.startOffset)
              .reduce((sum, slice) => sum + slice.delta, 0)
            const at = fragment.startOffset + shift
            // A unit spanning several text fragments (split around an inline
            // emoji image) writes its translation into the first slice and
            // blanks the rest; the images stay in place.
            const value = fragmentIndex === 0 ? translatedText : ""
            const next = node.data.slice(0, at) + value + node.data.slice(at + sliceLength)
            markExtensionDrivenCharacterData(node, next)
            node.data = next
            item.translatedValue = next
            appliedSlices.push({
              start: fragment.startOffset,
              end: fragment.endOffset,
              delta: value.length - sliceLength,
            })
            appliedAny = true
            return
          })
          if (appliedAny) refreshTranslationOnlySwapRecordExpectedText(record)
        })
        return "applied"
      }),
    )
    const failedUnits = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value === "failed",
    ).length
    if (failedUnits > 0) {
      logger.warn(
        `Virtual paragraph translation: ${failedUnits}/${includedUnits.length} units failed`,
      )
    }

    batchDOMOperation(() => {
      cancelSpinnerAnimation(spinner)
      markExtensionDrivenNodeRemoval(progressWrapper)
      progressWrapper.remove()

      // Settle-time self-heal: if the host diverged while units were in
      // flight, every refused application above left the record stale. The
      // mutation pipeline's retranslate may have been swallowed by the
      // translatingNodes in-flight guard, so schedule the bounded retry here.
      const liveState = getTranslationOnlyAnchorState(layoutSource)
      if (liveState?.swaps.includes(record) && !isTranslationOnlySwapRecordCurrent(record)) {
        scheduleStaleSwapRetry(
          nodes,
          nodes.filter(isTransNode),
          walkId,
          config,
          false,
          sessionIdAtEntry,
        )
      }
    })
    return true
  } finally {
    nodes.forEach((node) => translatingNodes.delete(node))
  }
}

// ---------------------------------------------------------------------------
// Stale-drop retry (translationOnly)
//
// The whole-run swap verifies a pre-request snapshot before writing; when the
// host rewrote the run mid-flight (x.com re-renders tweet text nodes
// in-place), the translation is dropped — and unlike bilingual, no anchor is
// registered yet, so the staleness pipeline cannot see the paragraph. Without
// a retry the paragraph stays in the source language permanently.
// ---------------------------------------------------------------------------

const staleSwapRetryCounts = new WeakMap<HTMLElement, { walkId: string; count: number }>()
const MAX_STALE_SWAP_RETRIES = 2
const STALE_SWAP_RETRY_DELAY_MS = 1500

function scheduleStaleSwapRetry(
  nodes: ChildNode[],
  transNodes: TransNode[],
  walkId: string,
  config: Config,
  toggle: boolean,
  sessionIdAtEntry: string | undefined,
): void {
  if (toggle || !sessionIdAtEntry) return
  const parent = transNodes.at(-1)?.parentElement
  if (!parent) return
  // Detached run nodes mean the host REPLACED the subtree: the mutation
  // pipeline's addedNodes path already re-walks the fresh nodes, so a retry
  // against the dead ones would be wasted.
  if (!transNodes.every((node) => node.isConnected)) return
  const entry = staleSwapRetryCounts.get(parent)
  const count = entry?.walkId === walkId ? entry.count : 0
  if (count >= MAX_STALE_SWAP_RETRIES) return
  staleSwapRetryCounts.set(parent, { walkId, count: count + 1 })
  setTimeout(() => {
    if (!parent.isConnected) return
    if (getPageTranslationSessionId() !== sessionIdAtEntry) return
    // A restart re-walks and re-labels everything under a new walkId; this
    // stale-walk retry must not retranslate on top of the fresh walk.
    const runRoot = nodes[0]
    if (isHTMLElement(runRoot) && runRoot.getAttribute(WALKED_ATTRIBUTE) !== walkId) return
    void translateNodeTranslationOnlyMode(nodes, walkId, config, toggle)
  }, STALE_SWAP_RETRY_DELAY_MS)
}

export async function translateNodeTranslationOnlyMode(
  nodes: ChildNode[],
  walkId: string,
  config: Config,
  toggle: boolean = false,
): Promise<void> {
  const isTransNodeAndNotTranslatedWrapper = (node: Node): node is TransNode => {
    if (isHTMLElement(node) && node.classList.contains(CONTENT_WRAPPER_CLASS)) return false
    return isTransNode(node)
  }

  const outerTransNodes = nodes.filter(isTransNode)
  if (outerTransNodes.length === 0) {
    return
  }

  // Virtual-paragraph segmentation for single-block runs (pre-wrap containers
  // such as x.com's tweetText): per-paragraph requests and slice swaps instead
  // of one block-level translation. Returns false when the run is not
  // segmentable; the generic whole-run path below then handles it.
  if (
    outerTransNodes.length === 1 &&
    isHTMLElement(outerTransNodes[0]) &&
    isBlockTransNode(outerTransNodes[0])
  ) {
    const handled = await translateSingleElementVirtualParagraphsTranslationOnly(
      outerTransNodes[0],
      nodes,
      walkId,
      config,
      toggle,
    )
    if (handled) return
  }

  let transNodes: TransNode[] = []
  let allChildNodes: ChildNode[] = []
  if (outerTransNodes.length === 1 && isHTMLElement(outerTransNodes[0])) {
    const unwrappedHTMLChild = unwrapDeepestOnlyHTMLChild(outerTransNodes[0], config)
    allChildNodes = [...unwrappedHTMLChild.childNodes]
    transNodes = allChildNodes.filter(isTransNodeAndNotTranslatedWrapper)
  } else {
    transNodes = outerTransNodes
    allChildNodes = nodes
  }

  if (transNodes.length === 0) {
    // The run may be nothing but a fallback wrapper whose originals were
    // displaced (e.g. a <li> holding only the translation). Its toggle must
    // still restore, so handle the wrapper before giving up on the run.
    const runWrappers = allChildNodes.filter(
      (node): node is HTMLElement =>
        isHTMLElement(node) &&
        node.classList.contains(CONTENT_WRAPPER_CLASS) &&
        node.getAttribute(TRANSLATION_MODE_ATTRIBUTE) ===
          ("translationOnly" satisfies TranslationMode) &&
        node.getAttribute(WALKED_ATTRIBUTE) !== walkId,
    )
    if (runWrappers.length === 0) return
    const restored: ChildNode[] = []
    for (const wrapper of runWrappers) {
      restored.push(...removeTranslatedWrapperWithRestore(wrapper))
    }
    if (!toggle) {
      const retryNodes = restored.filter((node) => node.isConnected)
      if (retryNodes.length > 0) {
        await translateNodeTranslationOnlyMode(retryNodes, walkId, config, toggle)
      }
    }
    return
  }

  try {
    if (nodes.every((node) => translatingNodes.has(node))) {
      return
    }
    nodes.forEach((node) => translatingNodes.add(node))

    const targetNode = transNodes.at(-1)!

    const parentNode = targetNode.parentElement
    if (!parentNode) {
      console.error("targetNode.parentElement is not HTMLElement", targetNode.parentElement)
      return
    }
    // An in-place swap leaves no wrapper — the anchor marker is the handle.
    // Restore FIRST (before any wrapper handling): a swapped run must undo its
    // own swap, never let an unrelated nested run's wrapper stand in for it.
    // Also runs before the filter/language checks below so they (and a
    // retranslation) see original text, not the previous translation.
    // Non-toggle (retranslation) keeps the records registered so the anchor
    // stays monitored through the provider round-trip — a re-swap dropped by
    // the mid-flight snapshot guard must not leave the region unwatched.
    const swapAnchor = parentNode.closest<HTMLElement>(`[${TRANSLATION_ONLY_ATTRIBUTE}]`)
    const restoredOwnSwap = swapAnchor
      ? restoreTranslationOnlySwapsForAnchor(
          swapAnchor,
          transNodes,
          toggle ? undefined : { keepRecords: true },
        )
      : false

    // Own-run wrapper discovery is scoped to the run itself: the fallback
    // wrapper is always inserted as a sibling within the run or appended into
    // a single-element run — a deep subtree query would steal a NESTED run's
    // wrapper (e.g. a li's) and leave this run's state untouched (#1846 review).
    const existedTranslatedWrapperOutside = targetNode.parentElement.closest(
      `.${CONTENT_WRAPPER_CLASS}`,
    )
    const finalTranslatedWrapper =
      existedTranslatedWrapperOutside ?? findRunTranslationOnlyWrapper(allChildNodes, walkId)
    if (finalTranslatedWrapper && isHTMLElement(finalTranslatedWrapper)) {
      const restoredNodes = removeTranslatedWrapperWithRestore(finalTranslatedWrapper)
      if (toggle) {
        return
      }
      // The restore synchronously re-inserted the SAME original node objects,
      // so when `nodes` are still connected they remain the correct
      // retranslation input. When they referenced the removed wrapper or its
      // translated content (both detached now), retranslate the restored
      // originals instead. Neither side connected means the host rebuilt the
      // region — leave it alone rather than loop.
      nodes.forEach((node) => translatingNodes.delete(node))
      const retryNodes = nodes.some((node) => node.isConnected)
        ? nodes
        : restoredNodes.filter((node) => node.isConnected)
      if (retryNodes.length > 0) {
        await translateNodeTranslationOnlyMode(retryNodes, walkId, config, toggle)
      }
      return
    }

    if (restoredOwnSwap && toggle) {
      return
    }

    const innerTextContent = transNodes.map((node) => extractTextContent(node, config)).join("")
    if (!innerTextContent.trim() || isNumericContent(innerTextContent)) return

    if (await shouldFilterSmallParagraph(innerTextContent, config)) return

    // Check the plain text, not the HTML string sent to the provider — franc
    // on markup is noise. Runs before the wrapper is inserted into the DOM.
    if (await shouldSkipAsTargetLanguage(innerTextContent, config)) return

    const ownerDoc = getOwnerDocument(targetNode)
    const protectedHtml = protectTranslationHtmlAttributes(transNodes, ownerDoc)
    const textContent = protectedHtml.sourceHtml
    if (!textContent) return

    // Taken before the provider request; the response handler compares against
    // it to detect host mutations that happened while the request was in
    // flight (never swap over content the host has since rewritten).
    const sourceSnapshot = snapshotSourceTextNodes(transNodes)
    const sessionIdAtEntry = getPageTranslationSessionId() ?? undefined
    // Source capture above must see the original values, but users should not
    // watch those values for the duration of the provider request. Repaint the
    // previous translation now; the response batch restores and replaces it
    // without yielding a frame in between.
    const replayedPreviousSwap =
      restoredOwnSwap && !!swapAnchor && replayTranslationOnlySwapsForAnchor(swapAnchor, transNodes)

    const translatedWrapperNode = ownerDoc.createElement("span")
    translatedWrapperNode.className = `${NOTRANSLATE_CLASS} ${CONTENT_WRAPPER_CLASS}`
    translatedWrapperNode.setAttribute(
      TRANSLATION_MODE_ATTRIBUTE,
      "translationOnly" satisfies TranslationMode,
    )
    translatedWrapperNode.setAttribute(WALKED_ATTRIBUTE, walkId)
    translatedWrapperNode.style.display = "contents"
    setTranslationDirAndLang(translatedWrapperNode, config)
    const spinner = createSpinnerInside(translatedWrapperNode)

    // Batch DOM insertion to reduce layout thrashing
    const insertOperation = () => {
      if (isTextNode(targetNode) || transNodes.length > 1) {
        targetNode.parentNode?.insertBefore(translatedWrapperNode, targetNode.nextSibling)
      } else {
        targetNode.appendChild(translatedWrapperNode)
      }
    }
    batchDOMOperation(insertOperation)

    const realTranslatedText = await getTranslatedTextAndRemoveSpinner(
      nodes,
      textContent,
      spinner,
      translatedWrapperNode,
      () => true,
      "html",
      () => translateProtectedHtml(protectedHtml, config),
    )
    const translatedText = realTranslatedText
      ? getDisplayTranslation(
          protectedHtml.comparisonSourceHtml,
          realTranslatedText,
          protectedHtml.normalizeForComparison(realTranslatedText),
        )
      : realTranslatedText

    if (!translatedText) {
      // Keep the wrapper when translation failed so the injected error UI remains visible.
      // Only remove the wrapper when translation returned an empty string.
      if (translatedText === "") {
        stageTranslationOnlyDOMOperation(() => {
          if (replayedPreviousSwap && swapAnchor) {
            restoreTranslationOnlySwapsForAnchor(swapAnchor, transNodes, {
              keepRecords: true,
            })
          }
          markExtensionDrivenNodeRemoval(translatedWrapperNode)
          translatedWrapperNode.remove()
        })
      }
      return
    }

    // Preferred strategy: swap the translation into the site's OWN text nodes,
    // leaving element identity (framework fibers, listeners) untouched. The
    // wrapper was only the spinner vehicle and is removed.
    const swapPlan = planInPlaceTextSwap(transNodes, translatedText, ownerDoc)
    if (swapPlan) {
      stageTranslationOnlyDOMOperation(() => {
        // Wrapper gone: a global cleanup ran while the provider call was in
        // flight, or the host re-rendered the region — leave originals alone.
        if (!translatedWrapperNode.isConnected) return
        if (replayedPreviousSwap && swapAnchor) {
          restoreTranslationOnlySwapsForAnchor(swapAnchor, transNodes, {
            keepRecords: true,
            refreshExpectedText: false,
          })
        }
        markExtensionDrivenNodeRemoval(translatedWrapperNode)
        translatedWrapperNode.remove()
        // Host mutated the run mid-flight: the translation is stale, drop it.
        // Any kept (restore-first) records still reference the run, so the
        // staleness pipeline retries with the host's fresh text.
        if (!verifySourceSnapshot(transNodes, sourceSnapshot)) {
          // No anchor was registered for this run yet, so nothing else can
          // heal the drop — without a bounded retry the paragraph stays in
          // the source language permanently (x.com rewrites tweet text nodes
          // in place while requests are in flight).
          scheduleStaleSwapRetry(nodes, transNodes, walkId, config, toggle, sessionIdAtEntry)
          return
        }
        staleSwapRetryCounts.delete(parentNode)
        applyInPlaceTextSwap(
          swapPlan,
          transNodes,
          parentNode,
          walkId,
          config,
          getTranslationOnlyAnchorState,
        )
      })
      return
    }

    // Fallback strategy: render into the wrapper and displace the originals,
    // retaining the node objects so restore can re-insert the same nodes (#1846).
    stageTranslationOnlyDOMOperation(() => {
      // Wrapper gone from the document: a global cleanup ran while the provider
      // call was in flight, or the host re-rendered the region. The originals
      // are the live content — don't remove them to apply a stale translation.
      if (!translatedWrapperNode.isConnected) return
      if (replayedPreviousSwap && swapAnchor) {
        restoreTranslationOnlySwapsForAnchor(swapAnchor, transNodes, {
          keepRecords: true,
          refreshExpectedText: false,
        })
      }

      // Render the completed translation into the wrapper; it stays detached
      // until this batched op runs on the next frame.
      // pi-lens-ignore: ast-grep:no-inner-html
      translatedWrapperNode.innerHTML = translatedText

      // Insert translated content after the last node
      const lastChildNode = allChildNodes.at(-1)!
      lastChildNode.parentNode?.insertBefore(translatedWrapperNode, lastChildNode.nextSibling)

      registerTranslationOnlyOriginals(translatedWrapperNode, allChildNodes)
      allChildNodes.forEach((childNode) => childNode.remove())
      // The wrapper now owns this run; kept swap records (restore-first
      // retranslation) would reference displaced nodes and read as
      // permanently stale — drop them.
      if (swapAnchor) dropTranslationOnlySwapRecordsForNodes(swapAnchor, transNodes)
    })
  } finally {
    nodes.forEach((node) => translatingNodes.delete(node))
  }
}
