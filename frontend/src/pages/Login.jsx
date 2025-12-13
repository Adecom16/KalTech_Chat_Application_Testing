import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { HiOutlineMail, HiOutlineLockClosed } from 'react-icons/hi'
import { ImSpinner8 } from 'react-icons/im'
import Logo from '../components/Logo'

const API_URL = 'http://localhost:3001'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
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
          <Logo size={64} className="mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-white">Kaltech <span className="text-gold">Chat</span></h1>
        </div>
      </div>

      {/* Form Card */}
      <div className="flex-1 flex items-start justify-center -mt-12 px-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-8 w-full max-w-md">
          <h2 className="text-xl text-white font-medium mb-6 text-center">Sign in to continue</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-neutral-400 text-sm mb-2">Email</label>
              <div className="relative">
                <HiOutlineMail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-black text-white rounded-lg border border-neutral-700 focus:outline-none focus:border-gold transition-colors"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-400 text-sm mb-2">Password</label>
              <div className="relative">
                <HiOutlineLockClosed className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-black text-white rounded-lg border border-neutral-700 focus:outline-none focus:border-gold transition-colors"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gold text-black rounded-lg font-semibold hover:bg-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <ImSpinner8 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-center mt-6 text-neutral-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-gold font-medium hover:text-gold-light transition-colors">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
