import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'

const API_URL = 'http://localhost:3001'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { darkMode, toggleTheme } = useTheme()

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
    <div className={`min-h-screen flex flex-col ${darkMode ? 'bg-katech-black' : 'bg-katech-white'}`}>
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full bg-katech-gold/20 hover:bg-katech-gold/30 transition-colors"
        aria-label="Toggle theme"
      >
        {darkMode ? (
          <svg className="w-6 h-6 text-katech-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-katech-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg border-2 border-katech-gold ${darkMode ? 'bg-katech-dark-surface' : 'bg-katech-light-surface'}`}>
              <span className="text-4xl">💬</span>
            </div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>Katech Chat</h1>
            <p className={`mt-2 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>Connect with your team instantly</p>
          </div>

          {/* Form Card */}
          <div className={`rounded-2xl shadow-2xl p-8 border ${darkMode ? 'bg-katech-dark-surface border-katech-dark-border' : 'bg-katech-white border-katech-light-border'}`}>
            <h2 className={`text-xl font-semibold mb-6 text-center ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>Welcome Back</h2>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-katech-gold focus:border-katech-gold transition-colors ${darkMode ? 'bg-katech-black border-katech-dark-border text-katech-white placeholder-katech-dark-muted' : 'bg-katech-light-surface border-katech-light-border text-katech-black placeholder-katech-light-muted'} border`}
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-katech-gold focus:border-katech-gold transition-colors ${darkMode ? 'bg-katech-black border-katech-dark-border text-katech-white placeholder-katech-dark-muted' : 'bg-katech-light-surface border-katech-light-border text-katech-black placeholder-katech-light-muted'} border`}
                  placeholder="Enter your password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-katech-gold hover:bg-katech-gold-dark text-katech-black rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>
            </form>

            <p className={`text-center mt-6 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>
              Don't have an account?{' '}
              <Link to="/register" className="text-katech-gold font-semibold hover:text-katech-gold-dark transition-colors">
                Register
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
