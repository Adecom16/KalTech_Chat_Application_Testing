import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const API_URL = 'http://localhost:3001'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }

      localStorage.setItem('kaltech_token', data.token)
      localStorage.setItem('kaltech_user', JSON.stringify(data.user))
      navigate('/chat')
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="bg-neutral-900 border-b border-neutral-800 h-48 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3">💬</div>
          <h1 className="text-3xl font-bold text-white">Kaltech <span className="text-gold">Chat</span></h1>
        </div>
      </div>

      {/* Form Card */}
      <div className="flex-1 flex items-start justify-center -mt-12 px-4 pb-8">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-8 w-full max-w-md">
          <h2 className="text-xl text-white font-medium mb-6 text-center">Create your account</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-neutral-400 text-sm mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-black text-white rounded-lg border border-neutral-700 focus:outline-none focus:border-gold transition-colors"
                placeholder="Enter your name"
                required
              />
            </div>

            <div>
              <label className="block text-neutral-400 text-sm mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-black text-white rounded-lg border border-neutral-700 focus:outline-none focus:border-gold transition-colors"
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label className="block text-neutral-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black text-white rounded-lg border border-neutral-700 focus:outline-none focus:border-gold transition-colors"
                placeholder="Create a password"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-neutral-400 text-sm mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black text-white rounded-lg border border-neutral-700 focus:outline-none focus:border-gold transition-colors"
                placeholder="Confirm your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gold text-black rounded-lg font-semibold hover:bg-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center mt-6 text-neutral-500">
            Already have an account?{' '}
            <Link to="/" className="text-gold font-medium hover:text-gold-light transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
