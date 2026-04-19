import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { diagnoseSkin, rankProducts } from '../lib/featherlessClient'
import { findProductsAndReviews } from '../lib/tinyfishClient'

/**
 * Orchestrates the 3-step AI pipeline for a case.
 * Reads case.status on mount and decides which step to start from (Section 12).
 * Each step writes its output + next status to Supabase before continuing.
 */
export function useCasePipeline(caseData, userId, onCaseUpdate) {
  const runningRef = useRef(false)

  useEffect(() => {
    if (!caseData || !userId) return

    const { status } = caseData

    console.log('[Pipeline] useCasePipeline effect fired:', { caseId: caseData?.id, status, userId, running: runningRef.current })

    // Steps that should trigger pipeline run
    const shouldRun = [
      'pending',
      'diagnosing',
      'diagnosis_complete',
      'searching_products',
      'ranking_products',
    ].includes(status)

    if (!shouldRun) {
      console.log('[Pipeline] Skipping — status does not require pipeline run:', status)
      return
    }
    if (runningRef.current) {
      console.log('[Pipeline] Skipping — pipeline already running')
      return
    }

    runningRef.current = true
    console.log('[Pipeline] Starting pipeline run for case:', caseData.id)

    runPipeline(caseData, userId, onCaseUpdate)
      .catch(err => console.error('[Pipeline] Unhandled pipeline error:', err))
      .finally(() => {
        runningRef.current = false
        console.log('[Pipeline] Pipeline run complete for case:', caseData.id)
      })
  }, [caseData?.id, caseData?.status, userId]) // eslint-disable-line react-hooks/exhaustive-deps
}

async function updateCase(caseId, updates, onCaseUpdate) {
  console.log('[Pipeline] updateCase →', updates)
  const { error } = await supabase
    .from('cases')
    .update(updates)
    .eq('id', caseId)

  if (error) {
    console.error('[Pipeline] updateCase DB error:', error)
    throw new Error(`DB update failed: ${error.message}`)
  }
  console.log('[Pipeline] updateCase DB write succeeded')
  onCaseUpdate?.(prev => ({ ...prev, ...updates }))
}

async function runPipeline(caseData, userId, onCaseUpdate) {
  if (!navigator.onLine) {
    console.warn('[Pipeline] Offline — aborting pipeline')
    return
  }
  const { id: caseId, status } = caseData

  // Determine start step per Section 12 resume logic
  let startStep = 1
  if (status === 'diagnosis_complete') startStep = 2
  else if (status === 'searching_products') startStep = 2
  else if (status === 'ranking_products') startStep = 3

  console.log('[Pipeline] Starting at step', startStep, 'for status:', status)

  // ─────────────────────────────────────────
  // STEP 1 — Featherless AI Vision Diagnosis
  // ─────────────────────────────────────────
  if (startStep <= 1) {
    console.log('[Pipeline] Step 1 — Vision diagnosis starting')
    try {
      await updateCase(caseId, { status: 'diagnosing' }, onCaseUpdate)

      // Fetch user profile
      console.log('[Pipeline] Fetching user profile for userId:', userId)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw new Error(`Profile fetch failed: ${profileError.message}`)
      console.log('[Pipeline] Profile fetched:', profile)

      // Fetch image from Supabase Storage as base64
      console.log('[Pipeline] Downloading image from storage:', caseData.image_path)
      const { data: imageBlob, error: imageError } = await supabase.storage
        .from('case-images')
        .download(caseData.image_path)

      if (imageError) throw new Error(`Image download failed: ${imageError.message}`)
      console.log('[Pipeline] Image downloaded, size:', imageBlob.size, 'type:', imageBlob.type)

      const base64 = await blobToBase64(imageBlob)
      const mediaType = imageBlob.type || 'image/jpeg'
      // Strip the data: prefix — we only need the raw base64
      const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64
      console.log('[Pipeline] base64 conversion done, rawBase64 length:', rawBase64.length, 'mediaType:', mediaType)

      console.log('[Pipeline] Calling diagnoseSkin…')
      const result = await diagnoseSkin({
        imageBase64: rawBase64,
        mediaType,
        demographics: profile,
        caseTitle: caseData.title,
      })
      console.log('[Pipeline] diagnoseSkin result:', result)

      const conditions = (result.conditions ?? []).sort((a, b) => b.confidence - a.confidence)
      const selected_condition = conditions[0]?.name ?? null
      console.log('[Pipeline] Parsed conditions:', conditions, '→ selected:', selected_condition)

      await updateCase(caseId, {
        status: 'diagnosis_complete',
        conditions,
        selected_condition,
      }, onCaseUpdate)

      // Continue to step 2 with updated data
      caseData = { ...caseData, status: 'diagnosis_complete', conditions, selected_condition }
      startStep = 2
      console.log('[Pipeline] Step 1 complete')
    } catch (err) {
      console.error('[Pipeline] Step 1 FAILED:', err)
      await setError(caseId, 'Diagnosis failed', onCaseUpdate)
      return
    }
  }

  // ─────────────────────────────────────────
  // STEP 2 — Tinyfish AI Product + Review Search
  // ─────────────────────────────────────────
  if (startStep <= 2) {
    console.log('[Pipeline] Step 2 — Product search starting')
    const condition = caseData.selected_condition
    if (!condition) {
      console.error('[Pipeline] Step 2 aborted — no selected_condition on caseData')
      await setError(caseId, 'No condition selected', onCaseUpdate)
      return
    }

    try {
      await updateCase(caseId, { status: 'searching_products' }, onCaseUpdate)

      console.log('[Pipeline] Calling findProductsAndReviews for:', condition)
      const rawProductsAndReviews = await findProductsAndReviews({ condition })
      console.log('[Pipeline] findProductsAndReviews result:', rawProductsAndReviews)

      if (!rawProductsAndReviews?.products?.length) {
        console.error('[Pipeline] Step 2 — no products returned')
        await setError(caseId, 'No products found', onCaseUpdate)
        return
      }

      await updateCase(caseId, {
        status: 'ranking_products',
        raw_products_and_reviews: rawProductsAndReviews,
      }, onCaseUpdate)

      caseData = { ...caseData, status: 'ranking_products', raw_products_and_reviews: rawProductsAndReviews }
      startStep = 3
      console.log('[Pipeline] Step 2 complete')
    } catch (err) {
      console.error('[Pipeline] Step 2 FAILED:', err)
      await setError(caseId, 'Product search failed', onCaseUpdate)
      return
    }
  }

  // ─────────────────────────────────────────
  // STEP 3 — Featherless AI Review Synthesis & Ranking
  // ─────────────────────────────────────────
  if (startStep <= 3) {
    console.log('[Pipeline] Step 3 — Product ranking starting')
    const condition = caseData.selected_condition

    // Fetch raw products if not in caseData (resume case)
    let rawProductsAndReviews = caseData.raw_products_and_reviews
    if (!rawProductsAndReviews) {
      console.log('[Pipeline] Step 3 — raw_products_and_reviews not in memory, fetching from DB')
      const { data, error } = await supabase
        .from('cases')
        .select('raw_products_and_reviews, selected_condition')
        .eq('id', caseId)
        .single()
      if (error || !data?.raw_products_and_reviews) {
        console.error('[Pipeline] Step 3 — failed to fetch raw products from DB:', error)
        await setError(caseId, 'Ranking failed', onCaseUpdate)
        return
      }
      rawProductsAndReviews = data.raw_products_and_reviews
    }

    try {
      console.log('[Pipeline] Calling rankProducts for:', condition)
      const rankedArray = await rankProducts({
        rawProductsAndReviews,
        condition: condition ?? 'skin condition',
      })
      console.log('[Pipeline] rankProducts result:', rankedArray)

      // LLM may return a wrapped object instead of a bare array — normalize it.
      const arr = Array.isArray(rankedArray)
        ? rankedArray
        : Array.isArray(rankedArray?.ranked)
          ? rankedArray.ranked
          : Array.isArray(rankedArray?.products)
            ? rankedArray.products
            : Object.values(rankedArray ?? {})

      // Re-attach url from the original products — the LLM never sees or returns it.
      const originalById = Object.fromEntries(
        (rawProductsAndReviews?.products ?? []).map(p => [p.id, p])
      )
      const ranked_products = arr
        .sort((a, b) => a.rank - b.rank)
        .map(p => ({ ...p, url: originalById[p.product_id]?.url ?? null }))
      const top_product = ranked_products[0] ?? null

      await updateCase(caseId, {
        status: 'complete',
        ranked_products,
        top_product,
      }, onCaseUpdate)
      console.log('[Pipeline] Step 3 complete — pipeline done')
    } catch (err) {
      console.error('[Pipeline] Step 3 FAILED:', err)
      await setError(caseId, 'Ranking failed', onCaseUpdate)
    }
  }
}

async function setError(caseId, message, onCaseUpdate) {
  console.log('[Pipeline] setError →', message)
  await supabase
    .from('cases')
    .update({ status: 'error', error_message: message })
    .eq('id', caseId)
  onCaseUpdate?.(prev => ({ ...prev, status: 'error', error_message: message }))
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
