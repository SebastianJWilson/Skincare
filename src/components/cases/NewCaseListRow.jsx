import { Link, useNavigate } from 'react-router-dom'

export default function NewCaseListRow({ weeklyCount = 0, isLimited = false, isPremium = false }) {
  const navigate = useNavigate()
  const used = Math.min(weeklyCount, 1)

  function handleClick(e) {
    if (isLimited) {
      e.preventDefault()
      navigate('/subscription')
    }
  }

  return (
    <Link
      to="/cases/new"
      aria-label={isLimited ? 'Weekly limit reached — subscribe to continue' : 'Create new case'}
      onClick={handleClick}
      className="app-card flex min-h-[92px] items-center gap-4 border border-dashed border-[#18211d]/18 bg-[#faf9f6] hover:-translate-y-0.5 hover:border-[#18211d]/22 hover:bg-white"
    >
      <div className="flex h-[68px] w-[68px] flex-shrink-0 items-center justify-center rounded-[1.2rem] border border-dashed border-[#18211d]/14 bg-white/80 text-[#18211d]">
        {isLimited ? (
          <svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        ) : (
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 5v14m7-7H5" />
          </svg>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tracking-[-0.02em] text-[#18211d]">
          {isLimited ? 'Weekly limit reached' : 'New case'}
        </p>
        {isPremium ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-[#18211d]">∞</span>
            <span className="text-[11px] text-[#7f8b83]">Unlimited scans</span>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5">
            {[0].map(i => (
              <span
                key={i}
                className={`h-1.5 w-5 rounded-full transition-colors ${
                  i < used ? 'bg-[#18211d]' : 'bg-[#18211d]/15'
                }`}
              />
            ))}
            <span className="ml-1 text-[11px] text-[#7f8b83]">{used}/1 this week</span>
          </div>
        )}
      </div>

    </Link>
  )
}
