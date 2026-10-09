import { useState } from 'react'
import { ArrowRight, CheckCircle2, Leaf, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { supabase } from './supabase'

export default function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setMessage(null)
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() || email.split('@')[0] } } })
      : await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (result.error) {
      setMessage({ type: 'error', text: result.error.message })
      return
    }
    if (mode === 'signup' && !result.data.session) {
      setMessage({ type: 'success', text: 'Check your email to confirm your account, then come back to sign in.' })
    }
  }

  async function signInWithGoogle() {
    if (!supabase) return
    setOauthLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) {
      setOauthLoading(false)
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function resetPassword() {
    if (!supabase) return
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Enter your email address first.' })
      return
    }
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` })
    setLoading(false)
    setMessage(error
      ? { type: 'error', text: error.message }
      : { type: 'success', text: 'Password reset email sent. Check your inbox for the secure link.' })
  }

  return <main className="auth-page">
    <section className="auth-story">
      <div className="auth-brand"><span><Leaf /></span>Mise</div>
      <div className="auth-copy"><span className="eyebrow"><Sparkles size={13} /> Your kitchen, remembered</span><h1>Know what you have.<br />Use what matters.</h1><p>Create an account to keep your kitchen synchronized and ready wherever you cook.</p><div className="auth-benefits"><span><CheckCircle2 /> Your inventory follows you</span><span><CheckCircle2 /> Grocery lists stay in sync</span><span><CheckCircle2 /> Every kitchen is securely separated</span></div></div>
      <p className="auth-footnote">Less waste. Calmer meals. A kitchen in rhythm.</p>
    </section>
    <section className="auth-form-wrap">
      <form className="auth-form" onSubmit={submit}>
        <span className="eyebrow">Welcome to Mise</span>
        <h2>{mode === 'signin' ? 'Come back to your kitchen' : 'Create your kitchen'}</h2>
        <p>{mode === 'signin' ? 'Sign in to continue where you left off.' : 'Start with a private kitchen you can access anywhere.'}</p>
        <button className="google-button" type="button" onClick={signInWithGoogle} disabled={oauthLoading || loading}><span aria-hidden="true">G</span>{oauthLoading ? 'Opening Google…' : 'Continue with Google'}</button>
        <div className="auth-divider"><span>or continue with email</span></div>
        {mode === 'signup' && <label>Your name<div><Sparkles /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Gourav" autoComplete="name" /></div></label>}
        <label>Email address<div><Mail /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></div></label>
        <label>Password<div><LockKeyhole /><input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></div></label>
        {mode === 'signin' && <button className="forgot-button" type="button" onClick={resetPassword} disabled={loading}>Forgot password?</button>}
        {message && <div className={`auth-message ${message.type}`}>{message.text}</div>}
        <button className="auth-submit" disabled={loading}>{loading ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight /></button>
        <button className="auth-switch" type="button" onClick={() => { setMode((current) => current === 'signin' ? 'signup' : 'signin'); setMessage(null) }}>{mode === 'signin' ? 'New to Mise? Create an account' : 'Already have an account? Sign in'}</button>
        <div className="auth-divider"><span>or</span></div>
        <button className="demo-button" type="button" onClick={onDemo}>Continue with a local demo</button>
        <small>Demo data stays only in this browser and will not sync.</small>
      </form>
    </section>
  </main>
}
