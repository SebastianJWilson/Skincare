import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import CaseStatusBadge from './CaseStatusBadge'

function useImageUrl(imagePath) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    if (!imagePath) return
    supabase.storage
      .from('case-images')
      .createSignedUrl(imagePath, 60 * 60) // 1-hour expiry
      .then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [imagePath])

  return url
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function CaseCard({ caseData }) {
  const imageUrl = useImageUrl(caseData.image_path)

  return (
    <Link
      to={`/cases/${caseData.id}`}
      className="app-card flex min-h-[92px] items-center gap-4 hover:-translate-y-0.5 hover:border-[#18211d]/12"
    >
      <div className="flex h-[68px] w-[68px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[1.2rem] bg-[#eef2ea]">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <svg className="h-7 w-7 text-[#839183]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4.5 12.75l7.5-7.5 7.5 7.5M4.5 19.5l7.5-7.5 7.5 7.5" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold text-[#18211d]">{caseData.title}</p>
          <span className="touch-target-override text-xs text-[#7f8b83]">{relativeTime(caseData.created_at)}</span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <CaseStatusBadge status={caseData.status} />
        </div>

        {caseData.status === 'complete' && caseData.top_product && (
          <p className="mt-2 truncate text-xs text-[#5e6a60]">{caseData.top_product.name}</p>
        )}
      </div>

      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f1ea] text-[#5e6a60]">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}
