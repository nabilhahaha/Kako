import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, House, Map, Plus, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const leftTabs = [
  { to: '/', label: 'Home', icon: House },
  { to: '/customers', label: 'Customers', icon: Users },
]
const rightTabs = [
  { to: '/map', label: 'Map', icon: Map },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
]

export function TabBar() {
  const navigate = useNavigate()

  return (
    <nav className="glass-bottom fixed inset-x-0 bottom-0 z-40 pb-safe">
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-1">
        {leftTabs.map((tab) => (
          <Tab key={tab.to} {...tab} />
        ))}
        <div className="flex w-14 items-center justify-center">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => navigate('/visits/new')}
            aria-label="New Visit"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-fab"
          >
            <Plus size={26} strokeWidth={2.4} />
          </motion.button>
        </div>
        {rightTabs.map((tab) => (
          <Tab key={tab.to} {...tab} />
        ))}
      </div>
    </nav>
  )
}

function Tab({ to, label, icon: Icon }: { to: string; label: string; icon: typeof House }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors',
          isActive ? 'text-accent' : 'text-ink-3',
        )
      }
    >
      <Icon size={22} strokeWidth={2} />
      {label}
    </NavLink>
  )
}
