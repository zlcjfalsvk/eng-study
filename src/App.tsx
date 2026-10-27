import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { BottomNav } from './components/BottomNav'
import { Spinner } from './components/ui'
import { useStore } from './store/progress'

const Home = lazy(() => import('./pages/Home'))
const Browse = lazy(() => import('./pages/Browse'))
const EntryDetail = lazy(() => import('./pages/EntryDetail'))
const Study = lazy(() => import('./pages/Study'))
const Quiz = lazy(() => import('./pages/Quiz'))
const Grammar = lazy(() => import('./pages/Grammar'))
const GrammarDetail = lazy(() => import('./pages/Grammar').then((m) => ({ default: m.GrammarDetail })))
const Settings = lazy(() => import('./pages/Settings'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

function ThemeSync() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  return null
}

export default function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <ThemeSync />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/browse/:level?" element={<Browse />} />
          <Route path="/entry/:id" element={<EntryDetail />} />
          <Route path="/study/:level?" element={<Study />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/grammar" element={<Grammar />} />
          <Route path="/grammar/:id" element={<GrammarDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </HashRouter>
  )
}
