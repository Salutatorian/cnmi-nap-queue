import { useEffect, useState } from 'react'

export function useServerOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let cancelled = false
    const ping = () => {
      fetch('/api/health', { cache: 'no-store' })
        .then((response) => {
          if (!cancelled) setOnline(response.ok)
        })
        .catch(() => {
          if (!cancelled) setOnline(false)
        })
    }
    ping()
    const id = window.setInterval(ping, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return online
}

export function useClock(withSeconds = false): string {
  const [text, setText] = useState('')

  useEffect(() => {
    const update = () => {
      setText(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Pacific/Saipan',
        hour: 'numeric',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
      }).format(new Date()))
    }
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [withSeconds])

  return text
}
