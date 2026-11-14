import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { Announcer } from '../audio'
import { api } from '../api'
import { ConnectionBanner, DemoBanner } from '../components/ui'
import { useClock, useServerOnline } from '../online'
import { formatWhen } from '../time'
import type { Announcement, BoardState, PublicSettings } from '../types'

function columns(count: number): number {
  if (count <= 1) return 1
  if (count <= 4) return 2
  if (count <= 6) return 3
  if (count <= 8) return 4
  return 5
}

export function TvPage() {
  const health = useServerOnline()
  const clock = useClock(true)
  const [socketOnline, setSocketOnline] = useState(false)
  const [board, setBoard] = useState<BoardState>({ cards: [], onDuty: [] })
  const [highlights, setHighlights] = useState<Record<number, string>>({})
  const [liveText, setLiveText] = useState('')
  const [audioOn, setAudioOn] = useState(false)
  const announcerRef = useRef<Announcer | null>(null)
  const highlightSeconds = useRef(20)
  if (!announcerRef.current) announcerRef.current = new Announcer()

  useEffect(() => {
    document.title = 'Waiting room — CNMI NAP Queue'
  }, [])

  useEffect(() => {
    const announcer = announcerRef.current
    if (!announcer) return
    const socket = io({ auth: { screen: 'tv' }, reconnection: true, reconnectionAttempts: Infinity })
    const applySettings = (settings: PublicSettings) => {
      announcer.volume = settings.chimeVolume
      highlightSeconds.current = settings.highlightSeconds
    }
    const highlight = (item: Announcement) => {
      setHighlights((current) => ({ ...current, [item.entryId]: item.nonce }))
      window.setTimeout(() => {
        setHighlights((current) => {
          if (current[item.entryId] !== item.nonce) return current
          const next = { ...current }
          delete next[item.entryId]
          return next
        })
      }, highlightSeconds.current * 1000)
      setLiveText(`${item.visitorName}, please proceed to ${item.caseworkerName}.`)
      announcer.enqueue(item)
    }
    socket.on('connect', () => setSocketOnline(true))
    socket.on('disconnect', () => setSocketOnline(false))
    socket.on('connect_error', () => setSocketOnline(false))
    socket.on('board:state', (state: BoardState) => setBoard(state))
    socket.on('public:settings', applySettings)
    socket.on('board:announce', highlight)
    api<BoardState>('/api/public/board').then(setBoard).catch(() => setSocketOnline(false))
    api<PublicSettings>('/api/public/settings').then(applySettings).catch(() => undefined)
    return () => {
      socket.close()
    }
  }, [])

  const count = board.cards.length
  const density = count >= 7 ? 'compact' : 'roomy'

  return (
    <div className="flex min-h-screen flex-col bg-tv text-white">
      <DemoBanner light />
      <ConnectionBanner online={health && socketOnline} />
      <header className="flex items-end justify-between gap-6 px-8 pt-6">
        <div>
          <p className="text-lg tracking-wide text-emerald-200">CNMI Nutrition Assistance Program</p>
          <h1 className="text-4xl font-bold">Waiting room</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tabular-nums">{clock}</p>
          <p className="text-white/70">Saipan time</p>
        </div>
      </header>
      <p className="sr-only" aria-live="assertive">{liveText}</p>
      <main className="flex flex-1 flex-col px-8 py-6">
        {count === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-5xl font-semibold">Please have a seat</p>
            <p className="mt-4 max-w-3xl text-2xl text-white/75">Your name will appear here when a caseworker calls you.</p>
          </div>
        ) : (
          <div className="board grid flex-1 gap-4" data-cols={columns(count)} data-density={density}>
            {board.cards.map((card) => {
              const justCalled = highlights[card.entryId] !== undefined
              return (
                <article
                  key={card.entryId}
                  className={`flex min-h-40 flex-col justify-between rounded-3xl p-5 ${justCalled ? 'bg-good ring-4 ring-emerald-200' : 'bg-white/10 ring-1 ring-white/20'}`}
                >
                  <div className="flex items-center justify-between gap-3 text-sm font-bold tracking-wide">
                    <span>NOW CALLING</span>
                    {justCalled && <span className="rounded-full bg-white px-3 py-1 text-good">JUST CALLED</span>}
                  </div>
                  <h2 className="visitor-name mt-3 font-bold">{card.visitorName}</h2>
                  <p className="worker-name mt-3 text-white/85">
                    Please proceed to <span className="font-semibold text-white">{card.caseworkerName}</span>
                  </p>
                  <p className="mt-2 text-sm text-white/60">Called {formatWhen(card.calledAt)}</p>
                </article>
              )
            })}
          </div>
        )}
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 px-8 pb-6">
        {count < 7 && board.onDuty.length > 0 ? (
          <p className="max-w-4xl text-lg text-white/75">
            On duty: {board.onDuty.map((person) => person.availability === 'busy' ? `${person.fullName} (busy)` : person.fullName).join(', ')}
          </p>
        ) : <span />}
        {audioOn ? (
          <p className="rounded-xl bg-white/10 px-4 py-3 font-semibold">Audio is on</p>
        ) : (
          <button
            type="button"
            className="min-h-16 rounded-xl bg-white px-6 text-xl font-bold text-navy"
            onClick={() => {
              const announcer = announcerRef.current
              if (!announcer) return
              void announcer.enable().then(() => setAudioOn(true)).catch(() => setAudioOn(false))
            }}
          >
            Enable audio
          </button>
        )}
      </footer>
    </div>
  )
}
