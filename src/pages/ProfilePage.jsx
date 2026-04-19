import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppShell from '../components/layout/AppShell'

const SKIN_TYPES = ['oily', 'dry', 'combination', 'normal', 'sensitive']
const BIO_SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#18211d]/6 last:border-0">
      <span className="text-sm text-[#5e6a60]">{label}</span>
      <span className="text-sm font-medium text-[#18211d] capitalize">{value || '—'}</span>
    </div>
  )
}

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(false)
  const [showSignOutDialog, setShowSignOutDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errors, setErrors] = useState({})

  // Edit form state — initialised from profile
  const [age, setAge] = useState(String(profile?.age ?? ''))
  const [weight, setWeight] = useState(String(profile?.weight_kg ?? ''))
  const [weightUnit, setWeightUnit] = useState('kg')
  const [skinType, setSkinType] = useState(profile?.skin_type ?? '')
  const [location, setLocation] = useState(profile?.location ?? '')
  const [raceEthnicity, setRaceEthnicity] = useState(profile?.race_ethnicity ?? '')
  const [biologicalSex, setBiologicalSex] = useState(profile?.biological_sex ?? '')

  function startEditing() {
    // Re-sync form state from profile in case it was refreshed
    setAge(String(profile?.age ?? ''))
    setWeight(String(profile?.weight_kg ?? ''))
    setWeightUnit('kg')
    setSkinType(profile?.skin_type ?? '')
    setLocation(profile?.location ?? '')
    setRaceEthnicity(profile?.race_ethnicity ?? '')
    setBiologicalSex(profile?.biological_sex ?? '')
    setErrors({})
    setServerError('')
    setEditing(true)
  }

  function toKg(value, unit) {
    const num = parseFloat(value)
    if (unit === 'lbs') return Math.round((num / 2.205) * 10) / 10
    return num
  }

  function validate() {
    const errs = {}
    if (!age || isNaN(age) || Number(age) < 1 || Number(age) > 120)
      errs.age = 'Please enter a valid age'
    if (!weight || isNaN(weight) || Number(weight) <= 0)
      errs.weight = 'Please enter a valid weight'
    if (!skinType) errs.skinType = 'Please select your skin type'
    if (!location.trim()) errs.location = 'Please enter your location'
    if (!biologicalSex) errs.biologicalSex = 'Please select an option'
    return errs
  }

  async function handleSave(e) {
    e.preventDefault()
    setServerError('')
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setErrors({})
    setLoading(true)

    const weight_kg = toKg(weight, weightUnit)

    const { error } = await supabase
      .from('profiles')
      .update({
        age: parseInt(age, 10),
        weight_kg,
        skin_type: skinType,
        location: location.trim(),
        race_ethnicity: raceEthnicity.trim() || null,
        biological_sex: biologicalSex,
      })
      .eq('id', user.id)

    setLoading(false)

    if (error) {
      setServerError(error.message)
    } else {
      await refreshProfile()
      setEditing(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const displayWeight = profile?.weight_kg != null ? `${profile.weight_kg} kg` : null
  const displaySex = BIO_SEX_OPTIONS.find(o => o.value === profile?.biological_sex)?.label ?? profile?.biological_sex

  const headerExtra = !editing && (
    <button
      type="button"
      onClick={startEditing}
      className="shrink-0 rounded-full border border-[#18211d]/10 bg-white/90 px-4 py-1.5 text-xs font-medium text-[#18211d] shadow-[0_1px_0_rgba(24,33,29,0.04)] transition-colors hover:bg-white"
    >
      Edit
    </button>
  )

  return (
    <AppShell title="Profile" headerExtra={headerExtra}>
      <div className="space-y-4">

        {/* Avatar + email */}
        <div className="app-panel flex items-center gap-4 px-5 py-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#18211d] text-xl font-semibold text-white">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#18211d]">{user?.email}</p>
            <p className="mt-0.5 text-xs text-[#7f8b83]">Member account</p>
          </div>
        </div>

        {/* Demographics — view mode */}
        {!editing && (
          <div className="app-panel px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#55635a]">Demographics</h2>
            </div>
            <InfoRow label="Age" value={profile?.age ? `${profile.age} yrs` : null} />
            <InfoRow label="Weight" value={displayWeight} />
            <InfoRow label="Skin type" value={profile?.skin_type} />
            <InfoRow label="Biological sex" value={displaySex} />
            <InfoRow label="Location" value={profile?.location} />
            <InfoRow label="Race / Ethnicity" value={profile?.race_ethnicity} />
          </div>
        )}

        {/* Demographics — edit mode */}
        {editing && (
          <form onSubmit={handleSave} className="app-panel space-y-5 px-5 py-5" noValidate>
            <span className="app-kicker block">Edit Demographics</span>

            {serverError && (
              <div className="rounded-[0.9rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            {/* Age */}
            <div className="space-y-2">
              <label htmlFor="pf-age" className="block text-sm font-medium text-[#324036]">
                Age <span className="text-red-500">*</span>
              </label>
              <input
                id="pf-age"
                type="number"
                min="1"
                max="120"
                value={age}
                onChange={e => setAge(e.target.value)}
                className={`app-input ${errors.age ? 'border-red-400 focus:border-red-400' : ''}`}
                placeholder="e.g. 28"
              />
              {errors.age && <p className="text-xs text-red-600">{errors.age}</p>}
            </div>

            {/* Weight */}
            <div className="space-y-2">
              <label htmlFor="pf-weight" className="block text-sm font-medium text-[#324036]">
                Weight <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="pf-weight"
                  type="number"
                  min="1"
                  step="0.1"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  className={`app-input flex-1 ${errors.weight ? 'border-red-400 focus:border-red-400' : ''}`}
                  placeholder={weightUnit === 'kg' ? 'e.g. 70' : 'e.g. 154'}
                />
                <div className="flex h-12 overflow-hidden rounded-full border border-[#18211d]/10 bg-white/76 p-1">
                  {['kg', 'lbs'].map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setWeightUnit(u)}
                      className={`rounded-full px-3 text-sm font-medium transition-all ${
                        weightUnit === u
                          ? 'bg-[#18211d] text-white'
                          : 'bg-transparent text-[#5e6a60] hover:bg-[#f3efe7]'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              {errors.weight && <p className="text-xs text-red-600">{errors.weight}</p>}
            </div>

            {/* Skin type */}
            <div className="space-y-3">
              <p className="block text-sm font-medium text-[#324036]">
                Skin Type <span className="text-red-500">*</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {SKIN_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSkinType(type)}
                    className={`rounded-full border px-4 py-2.5 text-sm font-medium capitalize transition-all ${
                      skinType === type
                        ? 'border-[#18211d] bg-[#18211d] text-white shadow-[0_14px_28px_rgba(24,33,29,0.12)]'
                        : 'border-[#18211d]/10 bg-white/75 text-[#5e6a60] hover:border-[#18211d]/20'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              {errors.skinType && <p className="text-xs text-red-600">{errors.skinType}</p>}
            </div>

            {/* Biological sex */}
            <div className="space-y-2">
              <label htmlFor="pf-sex" className="block text-sm font-medium text-[#324036]">
                Biological Sex <span className="text-red-500">*</span>
              </label>
              <select
                id="pf-sex"
                value={biologicalSex}
                onChange={e => setBiologicalSex(e.target.value)}
                className={`app-select ${errors.biologicalSex ? 'border-red-400 focus:border-red-400' : ''}`}
              >
                <option value="">Select…</option>
                {BIO_SEX_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.biologicalSex && <p className="text-xs text-red-600">{errors.biologicalSex}</p>}
            </div>

            {/* Location */}
            <div className="space-y-2">
              <label htmlFor="pf-location" className="block text-sm font-medium text-[#324036]">
                Location <span className="text-red-500">*</span>
              </label>
              <input
                id="pf-location"
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className={`app-input ${errors.location ? 'border-red-400 focus:border-red-400' : ''}`}
                placeholder="City, Country"
              />
              {errors.location && <p className="text-xs text-red-600">{errors.location}</p>}
            </div>

            {/* Race / Ethnicity */}
            <div className="space-y-2">
              <label htmlFor="pf-race" className="block text-sm font-medium text-[#324036]">
                Race / Ethnicity{' '}
                <span className="font-normal text-[#7f8b83]">(Optional)</span>
              </label>
              <input
                id="pf-race"
                type="text"
                value={raceEthnicity}
                onChange={e => setRaceEthnicity(e.target.value)}
                className="app-input"
                placeholder="e.g. East Asian, Hispanic, Black, etc."
              />
            </div>

            {/* Actions */}
            <div className="grid gap-3">
              <button type="submit" disabled={loading} className="app-button-primary w-full">
                {loading ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="app-button-secondary w-full"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Subscription */}
        {!editing && (
          <div className="app-panel px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#55635a]">Plan</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/subscription')}
              className="flex w-full items-center justify-between py-3 text-sm font-medium text-[#18211d] transition-colors hover:text-[#18211d]/70"
            >
              <div className="flex items-center gap-2.5">
                <span>{profile?.subscription_tier === 'premium' ? 'Premium' : 'Free'}</span>
                {profile?.subscription_tier === 'premium' ? (
                  <span className="rounded-full bg-[#18211d] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full border border-[#18211d]/15 bg-[#f4f1ea] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#5e6a60]">
                    1 / week
                  </span>
                )}
              </div>
              <svg className="h-4 w-4 text-[#7f8b83]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Sign-out */}
        {!editing && (
          <div className="app-panel px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#55635a]">Session</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowSignOutDialog(true)}
              className="flex w-full items-center justify-between py-3 text-sm font-medium text-red-600 transition-colors hover:text-red-700"
            >
              Sign out
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Sign-out confirmation dialog */}
      {showSignOutDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[#18211d]/28 px-4"
          onClick={() => setShowSignOutDialog(false)}
        >
          <div
            className="app-panel mb-4 w-full max-w-[430px] space-y-4 rounded-[1.5rem] px-5 py-5"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          >
            <div className="space-y-2">
              <span className="app-kicker">Session</span>
              <h2 className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#18211d]">Sign out</h2>
              <p className="max-w-[28ch] text-sm leading-6 text-[#5e6a60]">
                You can sign back in anytime to review past analyses and recommendations.
              </p>
            </div>
            <div className="grid gap-3">
              <button onClick={handleSignOut} className="app-button-primary w-full">
                Sign out
              </button>
              <button onClick={() => setShowSignOutDialog(false)} className="app-button-secondary w-full">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
