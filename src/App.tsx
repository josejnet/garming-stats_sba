import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useActivityStore } from './stores/activityStore'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Activities from './pages/Activities'
import ActivityDetailPage from './pages/ActivityDetail'
import FitnessChartPage from './pages/FitnessChartPage'
import ZoneAnalysis from './pages/ZoneAnalysis'
import Records from './pages/Records'
import Settings from './pages/Settings'
import PerformanceAnalysis from './pages/PerformanceAnalysis'
import LoginPage, { type SessionUser } from './pages/Login'
import Documentation from './pages/Documentation'

export default function App() {
  const loadActivities = useActivityStore(s => s.loadActivities)
  const loadStats = useActivityStore(s => s.loadStats)
  const clearUserData = useActivityStore(s => s.clearUserData)
  const theme = useActivityStore(s => s.settings.theme)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [googleAuthReady, setGoogleAuthReady] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        const sessionUser = data?.authenticated && data?.user?.id ? data.user : null
        setUser(sessionUser)
        if (!sessionUser) clearUserData()
        setGoogleAuthReady(Boolean(data?.authProviders?.google))
      })
      .catch(() => {
        setUser(null)
        clearUserData()
      })
      .finally(() => setSessionLoading(false))
  }, [clearUserData])

  useEffect(() => {
    if (!user) return
    loadActivities()
    loadStats()
  }, [loadActivities, loadStats, user])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  if (sessionLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#080f1e] text-sm text-slate-400">
        Cargando MostlyZ2...
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLogin={setUser} googleAuthReady={googleAuthReady} />
  }

  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar
          user={user}
          onLogout={() => {
            clearUserData()
            setUser(null)
          }}
        />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/activity/:id" element={<ActivityDetailPage />} />
            <Route path="/fitness" element={<FitnessChartPage />} />
            <Route path="/zones" element={<ZoneAnalysis />} />
            <Route path="/records" element={<Records />} />
            <Route path="/performance" element={<PerformanceAnalysis />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/docs" element={<Documentation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
