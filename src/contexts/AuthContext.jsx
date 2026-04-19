import { createContext, useReducer, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export const AuthContext = createContext(null)

const initialState = {
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
}

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_SESSION':
      return {
        ...state,
        session: action.payload.session,
        user: action.payload.session?.user ?? null,
        loading: false,
        profileLoading: !!action.payload.session?.user,
      }
    case 'SET_PROFILE':
      return { ...state, profile: action.payload, profileLoading: false }
    case 'PROFILE_LOAD_DONE':
      return { ...state, profileLoading: false }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SIGN_OUT':
      return { ...initialState, loading: false, profileLoading: false }
    default:
      return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error && data) {
      dispatch({ type: 'SET_PROFILE', payload: data })
    } else {
      dispatch({ type: 'PROFILE_LOAD_DONE' })
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      dispatch({ type: 'SET_SESSION', payload: { session } })
      if (session?.user) {
        fetchProfile(session.user.id)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        dispatch({ type: 'SET_SESSION', payload: { session } })
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          dispatch({ type: 'SIGN_OUT' })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    dispatch({ type: 'SIGN_OUT' })
  }

  async function refreshProfile() {
    if (state.user) {
      await fetchProfile(state.user.id)
    }
  }

  const value = {
    session: state.session,
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    profileLoading: state.profileLoading,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
