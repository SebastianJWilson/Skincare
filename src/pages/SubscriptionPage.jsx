import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppShell from '../components/layout/AppShell'

export default function SubscriptionPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [subscribing, setSubscribing] = useState(false)
  const [error, setError] = useState('')

  const isPremium = profile?.subscription_tier === 'premium'

  async function handleSubscribe() {
    setError('')
    setSubscribing(true)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ subscription_tier: 'premium' })
      .eq('id', user.id)

    if (updateError) {
      setError('Something went wrong. Please try again.')
      setSubscribing(false)
      return
    }

    await refreshProfile()
    navigate('/cases')
  }

  return (
    <AppShell title="Subscribe">
      <div className="space-y-5">
        <Link
          to="/cases"
          className="touch-target-override inline-flex items-center gap-2 text-sm font-medium text-[#5e6a60] transition-colors hover:text-[#18211d]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to cases
        </Link>

        {/* Hero panel */}
        <div className="app-panel-dark space-y-5">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <h1 className="max-w-[14ch] text-[2.3rem] font-semibold leading-[0.95] tracking-[-0.07em]">
                Unlock unlimited analyses.
              </h1>
              <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/8 text-lg">
                ✦
              </span>
            </div>
            <p className="max-w-[28ch] text-sm leading-6 text-white/72">
              You've used your 1 free scan this week. Subscribe to keep getting AI-powered skin analyses and personalized product matches.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-white/76">
            <div className="rounded-[1.1rem] border border-white/10 bg-white/5 px-3 py-3">Unlimited cases</div>
            <div className="rounded-[1.1rem] border border-white/10 bg-white/5 px-3 py-3">AI diagnosis</div>
            <div className="rounded-[1.1rem] border border-white/10 bg-white/5 px-3 py-3">Product rank</div>
          </div>
        </div>

        {/* Pricing card */}
        <div className="app-panel space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#7f8b83]">Premium</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[2rem] font-semibold tracking-[-0.05em] text-[#18211d]">$2.99</span>
                <span className="text-sm text-[#7f8b83]">/month</span>
              </div>
            </div>
            <div className="rounded-full bg-[#f4f1ea] px-3 py-1 text-xs font-semibold text-[#5e6a60]">
              Most popular
            </div>
          </div>

          <div className="space-y-2.5">
            {[
              'Unlimited skin analyses per week',
              'AI-powered condition diagnosis',
              'Personalized product recommendations',
              'Priority processing',
            ].map(feature => (
              <div key={feature} className="flex items-center gap-2.5 text-sm text-[#18211d]">
                <svg className="h-4 w-4 flex-shrink-0 text-[#5e6a60]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="app-panel-muted space-y-4">
          {error && (
            <div className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {isPremium ? (
            <div className="rounded-[1.2rem] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              You're already subscribed. Enjoy unlimited cases!
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={subscribing}
              className="app-button-primary w-full"
            >
              <span>{subscribing ? 'Activating...' : 'Subscribe — $2.99/mo'}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12 text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-5-5 5 5-5 5" />
                </svg>
              </span>
            </button>
          )}

          <p className="text-center text-xs leading-5 text-[#7f8b83]">
            This is a mock subscription for testing. No payment is processed.
          </p>
        </div>
      </div>
    </AppShell>
  )
}
