import { useEffect } from 'react'
import { DemoBanner } from '../components/ui'

export function PaperPage() {
  useEffect(() => {
    document.title = 'Paper fallback — CNMI NAP Queue'
  }, [])

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">Demonstration procedure</p>
      <h1 className="mt-2 text-4xl font-semibold">Paper sign-in fallback</h1>
      <p className="mt-4 text-lg">Use this when the queue computer, the network, or the waiting-room screen is down. Keep a clipboard and a pen at the front desk.</p>
      <ol className="mt-6 list-decimal space-y-3 pl-6 text-lg">
        <li>Write the time, the visitor’s full name, the caseworker, and the reason for the visit.</li>
        <li>Call people in the order they signed in. Say the visitor’s name and the caseworker’s name.</li>
        <li>Mark each line called, missed, or done. Do not throw the sheet away.</li>
        <li>When the system is back, a receptionist or supervisor enters those names on the staff check-in screen.</li>
        <li>Do not write dates of birth, Social Security numbers, or case numbers on the clipboard.</li>
      </ol>
      <p className="mt-8 text-sm text-muted">This page can be printed before an outage. It does not contain visitor records.</p>
      <button type="button" className="mt-4 min-h-12 rounded-xl bg-navy px-5 font-semibold text-white" onClick={() => window.print()}>
        Print this page
      </button>
      </main>
    </div>
  )
}
