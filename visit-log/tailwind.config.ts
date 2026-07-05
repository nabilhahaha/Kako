import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--c-ink-2) / <alpha-value>)',
        'ink-3': 'rgb(var(--c-ink-3) / <alpha-value>)',
        separator: 'rgb(var(--c-separator) / <alpha-value>)',
        accent: {
          DEFAULT: '#E30613',
          soft: 'rgb(var(--c-accent-soft) / <alpha-value>)',
          dark: '#B00510',
          light: '#FF3B45',
        },
        ios: {
          green: '#34C759',
          blue: '#007AFF',
          orange: '#FF9500',
          yellow: '#FFCC00',
          purple: '#AF52DE',
          teal: '#30B0C7',
          indigo: '#5856D6',
          pink: '#FF2D55',
        },
      },
      borderRadius: {
        card: '1.375rem',
        sheet: '1.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 8px 24px -8px rgb(16 24 40 / 0.08)',
        'card-lg': '0 2px 4px rgb(16 24 40 / 0.05), 0 16px 40px -12px rgb(16 24 40 / 0.14)',
        sheet: '0 -8px 40px -8px rgb(16 24 40 / 0.22)',
        fab: '0 6px 16px -4px rgb(227 6 19 / 0.45), 0 2px 6px rgb(227 6 19 / 0.25)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
