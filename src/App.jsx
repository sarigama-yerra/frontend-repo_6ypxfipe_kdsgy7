import { useEffect, useMemo, useRef, useState } from 'react'

// Simple Google Maps loader without extra deps
function useGoogleMaps(apiKey) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (window.google && window.google.maps) {
      setLoaded(true)
      return
    }
    const existing = document.getElementById('google-maps')
    if (existing) {
      existing.addEventListener('load', () => setLoaded(true))
      return
    }
    const script = document.createElement('script')
    script.id = 'google-maps'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => setLoaded(true)
    document.body.appendChild(script)
  }, [apiKey])

  return loaded
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

function App() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const drawingLayer = useRef(null)

  const [level, setLevel] = useState('state') // state | county
  const [selectedItems, setSelectedItems] = useState([])
  const [name, setName] = useState('My Selection')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState([])

  const mapsLoaded = useGoogleMaps(GOOGLE_MAPS_API_KEY)

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstance.current) return
    const center = { lat: 39.8283, lng: -98.5795 } // USA center
    mapInstance.current = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 4,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    })
  }, [mapsLoaded])

  // Toggle selection by code (state postal or county FIPS)
  function toggleItem(code) {
    setSelectedItems(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code)
      return [...prev, code]
    })
  }

  // Minimal lists to demonstrate interaction without huge datasets
  const stateOptions = useMemo(() => [
    { code: 'CA', name: 'California' },
    { code: 'TX', name: 'Texas' },
    { code: 'NY', name: 'New York' },
    { code: 'FL', name: 'Florida' },
    { code: 'WA', name: 'Washington' },
    { code: 'IL', name: 'Illinois' },
  ], [])

  const countyOptions = useMemo(() => [
    { code: '06075', name: 'San Francisco County, CA' },
    { code: '06037', name: 'Los Angeles County, CA' },
    { code: '36061', name: 'New York County, NY' },
    { code: '12086', name: 'Miami-Dade County, FL' },
    { code: '53033', name: 'King County, WA' },
  ], [])

  async function saveSelection() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, level, items: selectedItems })
      })
      const data = await res.json()
      if (res.ok) {
        const listRes = await fetch(`${BACKEND_URL}/api/selections`)
        const list = await listRes.json()
        setSaved(list)
      } else {
        console.error(data)
        alert('Failed to save')
      }
    } catch (e) {
      console.error(e)
      alert('Error while saving')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    // Initial load of saved selections
    async function loadSaved() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/selections`)
        const data = await res.json()
        if (Array.isArray(data)) setSaved(data)
      } catch {}
    }
    loadSaved()
  }, [])

  // Basic visual feedback on map by dropping markers colored by level
  useEffect(() => {
    if (!mapsLoaded || !mapInstance.current) return
    // Clear old markers if any
    if (drawingLayer.current) {
      drawingLayer.current.forEach(m => m.setMap(null))
    }
    drawingLayer.current = []

    const geocoder = new window.google.maps.Geocoder()

    const items = selectedItems.slice(0, 12) // cap to avoid quota
    items.forEach((code) => {
      const query = level === 'state' ? `${code} state, USA` : `county ${code} USA`
      geocoder.geocode({ address: query }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location
          const marker = new window.google.maps.Marker({
            position: loc,
            map: mapInstance.current,
            title: code,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: level === 'state' ? '#3b82f6' : '#f59e0b',
              fillOpacity: 0.9,
              strokeWeight: 1,
              strokeColor: '#111827'
            }
          })
          drawingLayer.current.push(marker)
        }
      })
    })
  }, [mapsLoaded, level, selectedItems])

  return (
    <div className="min-h-screen grid grid-rows-[auto,1fr]">
      <header className="px-4 py-3 border-b bg-white/70 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-semibold">Geo Shade Builder</span>
          <span className="text-xs text-gray-500">Select US states or counties and save/export</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={level} onChange={e => { setLevel(e.target.value); setSelectedItems([]) }} className="border rounded px-2 py-1">
            <option value="state">States</option>
            <option value="county">Counties</option>
          </select>
          <input value={name} onChange={e => setName(e.target.value)} className="border rounded px-2 py-1" placeholder="Selection name" />
          <button onClick={saveSelection} disabled={saving || !selectedItems.length} className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-[320px,1fr]">
        <aside className="p-4 border-r space-y-4 bg-white">
          <div>
            <div className="text-sm font-medium mb-2">Choose {level === 'state' ? 'states' : 'counties'}</div>
            <div className="max-h-64 overflow-auto space-y-1 pr-1">
              {(level === 'state' ? stateOptions : countyOptions).map(opt => (
                <label key={opt.code} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedItems.includes(opt.code)} onChange={() => toggleItem(opt.code)} />
                  <span>{opt.name}</span>
                  <span className="ml-auto text-gray-400 text-xs">{opt.code}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Selected</div>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map(code => (
                <span key={code} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1">
                  {code}
                  <button onClick={() => toggleItem(code)} className="text-blue-700 hover:text-blue-900">×</button>
                </span>
              ))}
            </div>
            <button onClick={() => setSelectedItems([])} className="mt-2 text-xs text-gray-600 hover:underline">Clear all</button>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Saved selections</div>
            <div className="space-y-2">
              {saved.map(s => (
                <div key={s.id} className="border rounded p-2">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.level} • {s.items?.length || 0} items</div>
                  <div className="flex gap-2 mt-2">
                    <a className="text-blue-600 text-xs hover:underline" href={`${BACKEND_URL}/api/selections/${s.id}/export.csv`} target="_blank" rel="noreferrer">Export CSV</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <main className="relative">
          {!GOOGLE_MAPS_API_KEY && (
            <div className="absolute inset-0 z-10 bg-yellow-50 border-b border-yellow-200 p-3 text-sm text-yellow-900">
              Add VITE_GOOGLE_MAPS_API_KEY in environment to enable map rendering.
            </div>
          )}
          <div ref={mapRef} className="w-full h-[70vh] md:h-full" />
        </main>
      </div>
    </div>
  )
}

export default App
