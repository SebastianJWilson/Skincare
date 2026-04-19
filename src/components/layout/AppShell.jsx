import { NavLink, useLocation } from 'react-router-dom'

function NavIcon({ children, label, to, isActiveOverride }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => {
        const active = typeof isActiveOverride === 'boolean' ? isActiveOverride : isActive

        return (
        `flex min-w-[84px] flex-col items-center gap-1 rounded-[0.85rem] px-3 py-2.5 text-[11px] font-medium tracking-[0.02em] transition-all duration-300 ${
          active
            ? 'bg-[#18211d] text-white shadow-[0_14px_28px_rgba(24,33,29,0.16)]'
            : 'text-[#5e6a60] hover:bg-white/65 hover:text-[#18211d]'
        }`
        )
      }}
    >
      {children}
      <span className="touch-target-override">{label}</span>
    </NavLink>
  )
}

export default function AppShell({ children, title, headerExtra = null }) {
  const location = useLocation()
  const isCasesTabActive =
    location.pathname === '/cases' ||
    (location.pathname.startsWith('/cases/') && !location.pathname.startsWith('/cases/new'))

  return (
    <div className="app-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#18211d] focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="app-mobile-frame px-4 pb-[calc(112px+env(safe-area-inset-bottom))] pt-3">
        <header className="app-floating-nav sticky top-[calc(env(safe-area-inset-top)+12px)] z-20 mb-5 rounded-[1.35rem] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`min-w-0 ${headerExtra ? 'flex-1' : ''}`}>
              <h1 className="truncate text-xl font-semibold tracking-[-0.04em] text-[#18211d]">{title}</h1>
            </div>
            {headerExtra}
          </div>
        </header>

        <main id="main-content" className="app-fade-up">
          {children}
        </main>
      </div>

      <nav
        className="app-floating-nav fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-1.5rem)] max-w-[398px] -translate-x-1/2 items-center justify-around rounded-[1.4rem] px-2 py-2"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <NavIcon to="/cases" label="Cases" isActiveOverride={isCasesTabActive}>
          <svg className="h-5 w-5 touch-target-override" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </NavIcon>
        <NavIcon to="/cases/new" label="New">
          <svg className="h-5 w-5 touch-target-override" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </NavIcon>
        <NavIcon to="/profile" label="Profile">
          <svg className="h-5 w-5 touch-target-override" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </NavIcon>
      </nav>

    </div>
  )
}
