import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import ImageUploadZone from '../components/cases/ImageUploadZone'
import CaseDescriptionInput from '../components/cases/CaseDescriptionInput'
import AppShell from '../components/layout/AppShell'

export default function NewCasePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  // Redirect to subscription page if weekly limit reached
  useEffect(() => {
    if (!user || !profile) return
    if (profile.subscription_tier === 'premium') return

    async function checkLimit() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo)

      if (count >= 1) {
        navigate('/subscription', { replace: true })
      }
    }

    checkLimit()
  }, [user, profile, navigate])

  const [imageData, setImageData] = useState(null) // { file, previewUrl }
  const [imageError, setImageError] = useState('')
  const [description, setDescription] = useState('')
  const [descError, setDescError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function handleImageSelected(data, errorMsg) {
    if (errorMsg) {
      setImageError(errorMsg)
      setImageData(null)
    } else {
      setImageError('')
      setImageData(data)
    }
  }

  const canSubmit = imageData && description.trim().length > 0 && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    // Validate
    let hasError = false
    if (!imageData) { setImageError('Please upload a photo'); hasError = true }
    if (!description.trim()) { setDescError('Please describe your concern'); hasError = true }
    if (hasError) return

    setSubmitError('')
    setSubmitting(true)

    const caseId = uuidv4()
    const imagePath = `${user.id}/${caseId}.jpg`

    // Upload image to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('case-images')
      .upload(imagePath, imageData.file, { contentType: imageData.file.type, upsert: false })

    if (uploadError) {
      setSubmitError('Image upload failed. Please try again.')
      setSubmitting(false)
      return
    }

    // Insert case row
    const { error: insertError } = await supabase
      .from('cases')
      .insert({
        id: caseId,
        user_id: user.id,
        title: description.trim(),
        image_path: imagePath,
        status: 'pending',
      })

    if (insertError) {
      // Clean up uploaded image on insert failure
      await supabase.storage.from('case-images').remove([imagePath])
      setSubmitError('Failed to create case. Please try again.')
      setSubmitting(false)
      return
    }

    navigate(`/cases/${caseId}`, { replace: true })
  }

  return (
    <AppShell title="New analysis">
      <div className="space-y-5">
        <div className="space-y-4">
          <Link
            to="/cases"
            className="touch-target-override inline-flex items-center gap-2 text-sm font-medium text-[#5e6a60] transition-colors hover:text-[#18211d]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to cases
          </Link>

          <div className="app-panel-dark space-y-5">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <h1 className="max-w-[11ch] text-[2.3rem] font-semibold leading-[0.95] tracking-[-0.07em]">
                  Build a product match from one photo.
                </h1>
                <span
                  className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/8 text-sm font-semibold text-white/90"
                  aria-label="Informational card"
                  title="Informational card"
                >
                  ?
                </span>
              </div>
              <div className="space-y-2">
                <p className="max-w-[28ch] text-sm leading-6 text-white/72">
                  Upload a close-up, describe the concern, and the pipeline will search the catalog for the best fit.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-white/76">
              <div className="rounded-[0.85rem] border border-white/10 bg-white/5 px-3 py-3">1. Upload</div>
              <div className="rounded-[0.85rem] border border-white/10 bg-white/5 px-3 py-3">2. Diagnose</div>
              <div className="rounded-[0.85rem] border border-white/10 bg-white/5 px-3 py-3">3. Rank</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <div className="rounded-[0.9rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <div className="app-panel space-y-5">
            <ImageUploadZone
              imagePreview={imageData?.previewUrl ?? null}
              onImageSelected={handleImageSelected}
              error={imageError}
            />

            <div className="app-divider pt-5">
              <CaseDescriptionInput
                value={description}
                onChange={val => {
                  setDescription(val)
                  if (val.trim()) setDescError('')
                }}
                error={descError}
              />
            </div>
          </div>

          <div className="app-panel-muted space-y-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="app-button-primary w-full"
            >
              <span>{submitting ? 'Uploading...' : 'Run analysis'}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12 text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-5-5 5 5-5 5" />
                </svg>
              </span>
            </button>

            <p className="text-xs leading-5 text-[#7f8b83]">
              Photos and concern data are processed by third-party AI services. Keep identifying details out of frame.
            </p>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
