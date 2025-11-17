import { useEffect, useMemo, useRef, useState } from 'react'

// Simple Google Maps loader without extra deps
function useGoogleMaps(apiKey) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // If already loaded, nothing to do
    if (window.google && window.google.maps) {
      setLoaded(true)
      return
    }

    if (!apiKey) return

    const existing = document.getElementById('google-maps')
    if (existing) {
      const src = existing.getAttribute('src') || ''
      // If the existing script does not include this apiKey, replace it
      if (!src.includes(apiKey)) {
        existing.remove()
      } else {
        existing.addEventListener('load', () => setLoaded(true))
        return
      }
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

// Resolve settings from env, URL params, or localStorage so you can use the app without editing code
function useSettings() {
  const params = new URLSearchParams(window.location.search)
  const initialApiKey = (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    localStorage.getItem('gmaps_api_key') ||
    params.get('gmaps_key') ||
    ''
  )
  const initialBackend = (
    import.meta.env.VITE_BACKEND_URL ||
    localStorage.getItem('backend_url') ||
    ''
  )
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [backendUrl, setBackendUrl] = useState(initialBackend)

  // Persist changes
  useEffect(() => {
    if (apiKey) localStorage.setItem('gmaps_api_key', apiKey)
  }, [apiKey])
  useEffect(() => {
    if (backendUrl) localStorage.setItem('backend_url', backendUrl)
  }, [backendUrl])

  return { apiKey, setApiKey, backendUrl, setBackendUrl }
}

const STATE_NAME_TO_POSTAL = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  // DC and territories (optional in this GeoJSON)
  'District of Columbia': 'DC'
}

function App() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const drawingLayer = useRef(null)
  const clickListenerRef = useRef(null)
  const dataClickListenerRef = useRef(null)
  const geojsonLoadedRef = useRef(false)

  const { apiKey, setApiKey, backendUrl, setBackendUrl } = useSettings()

  const [level, setLevel] = useState('state') // state | county
  const [selectedItems, setSelectedItems] = useState([])
  const [name, setName] = useState('My Selection')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [hint, setHint] = useState('')

  const mapsLoaded = useGoogleMaps(apiKey)

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

  // Map of county name+state to FIPS for demo counties
  const countyNameToFips = useMemo(() => ({
    'San Francisco County, CA': '06075',
    'Los Angeles County, CA': '06037',
    'New York County, NY': '36061',
    'Miami-Dade County, FL': '12086',
    'King County, WA': '53033',
  }), [])

  async function saveSelection() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${backendUrl}/api/selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, level, items: selectedItems })
      })
      const data = await res.json()
      if (res.ok) {
        const listRes = await fetch(`${backendUrl}/api/selections`)
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
        if (!backendUrl) return
        const res = await fetch(`${backendUrl}/api/selections`)
        const data = await res.json()
        if (Array.isArray(data)) setSaved(data)
      } catch {}
    }
    loadSaved()
  }, [backendUrl])

  // Load and render US state polygons via GeoJSON in Data Layer when level === 'state'
  useEffect(() => {
    if (!mapsLoaded || !mapInstance.current) return

    // Clear previous data and listeners when switching levels
    mapInstance.current.data.setStyle(null)
    mapInstance.current.data.forEach(f => mapInstance.current.data.remove(f))
    if (dataClickListenerRef.current) {
      window.google.maps.event.removeListener(dataClickListenerRef.current)
      dataClickListenerRef.current = null
    }

    if (level !== 'state') {
      geojsonLoadedRef.current = false
      return
    }

    async function ensureGeoJsonLoaded() {
      if (geojsonLoadedRef.current) return
      try {
        // Public domain US states GeoJSON with names
        const url = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
        const res = await fetch(url)
        const gj = await res.json()
        mapInstance.current.data.addGeoJson(gj)
        // Assign postal property based on state name for easy use later
        mapInstance.current.data.forEach((feature) => {
          const name = feature.getProperty('name')
          const postal = STATE_NAME_TO_POSTAL[name]
          if (postal) feature.setProperty('postal', postal)
        })
        geojsonLoadedRef.current = true
      } catch (e) {
        console.error('Failed to load state polygons', e)
        setHint('Could not load state polygons. Check your network and try again.')
        setTimeout(() => setHint(''), 3000)
      }
    }

    ensureGeoJsonLoaded().then(() => {
      // Style based on selection
      mapInstance.current.data.setStyle((feature) => {
        const code = feature.getProperty('postal') || STATE_NAME_TO_POSTAL[feature.getProperty('name')] || null
        const selected = code ? selectedItems.includes(code) : false
        return {
          fillColor: selected ? '#3b82f6' : '#93c5fd',
          fillOpacity: selected ? 0.55 : 0.15,
          strokeColor: selected ? '#1d4ed8' : '#2563eb',
          strokeWeight: selected ? 2 : 1
        }
      })

      // Clicking directly on a state polygon toggles it
      dataClickListenerRef.current = mapInstance.current.data.addListener('click', (e) => {
        const name = e.feature.getProperty('name')
        const code = e.feature.getProperty('postal') || STATE_NAME_TO_POSTAL[name]
        if (code) {
          toggleItem(code)
          setHint(`Toggled state ${code}`)
          setTimeout(() => setHint(''), 2000)
        }
      })
    })
  }, [mapsLoaded, level, selectedItems])

  // Clicking on the base map (non-polygon areas) selects based on reverse geocoding (for states)
  useEffect(() => {
    if (!mapsLoaded || !mapInstance.current) return

    // Cleanup previous listener
    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current)
      clickListenerRef.current = null
    }

    const geocoder = new window.google.maps.Geocoder()

    function extractStateCode(components) {
      const stateComp = components.find(c => c.types.includes('administrative_area_level_1'))
      return stateComp?.short_name || null
    }

    function extractCountyLabel(components) {
      const countyComp = components.find(c => c.types.includes('administrative_area_level_2'))
      const stateComp = components.find(c => c.types.includes('administrative_area_level_1'))
      if (!countyComp || !stateComp) return null
      let countyName = countyComp.long_name
      if (!/County$/i.test(countyName) && !/Parish$/i.test(countyName) && !/Borough$/i.test(countyName)) {
        countyName = countyName + ' County'
      }
      const label = `${countyName}, ${stateComp.short_name}`
      return label
    }

    clickListenerRef.current = mapInstance.current.addListener('click', (e) => {
      const latLng = e.latLng
      // If user clicks a polygon, Data layer handles it. This is for base map clicks.
      const geocodeFor = level === 'state' ? 'state' : 'county'
      geocoder.geocode({ location: latLng }, (results, status) => {
        if (status !== 'OK' || !results || !results[0]) return
        const components = results[0].address_components || []
        if (geocodeFor === 'state') {
          const code = extractStateCode(components)
          if (code) {
            toggleItem(code)
            setHint(`Toggled state ${code}`)
          } else {
            setHint('Could not determine state here')
          }
        } else {
          const label = extractCountyLabel(components)
          if (label && countyNameToFips[label]) {
            const fips = countyNameToFips[label]
            toggleItem(fips)
            setHint(`Toggled ${label}`)
          } else {
            setHint('Clicked county not in demo list. We will add full US counties soon.')
          }
        }
        setTimeout(() => setHint(''), 2500)
      })
    })

    return () => {
      if (clickListenerRef.current) {
        window.google.maps.event.removeListener(clickListenerRef.current)
      }
    }
  }, [mapsLoaded, level, countyNameToFips])

  // Basic visual feedback for counties using markers (until full county polygons are added)
  useEffect(() => {
    if (!mapsLoaded || !mapInstance.current) return

    // For states, Data layer handles polygons. Clear marker layer.
    if (level === 'state') {
      if (drawingLayer.current) {
        drawingLayer.current.forEach(m => m.setMap(null))
      }
      drawingLayer.current = []
      return
    }

    // Counties demo with markers
    if (drawingLayer.current) {
      drawingLayer.current.forEach(m => m.setMap(null))
    }
    drawingLayer.current = []

    const geocoder = new window.google.maps.Geocoder()

    const items = selectedItems.slice(0, 12) // cap to avoid quota
    items.forEach((code) => {
      const query = `FIPS ${code} county USA`
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
              fillColor: '#f59e0b',
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
          <button className="text-sm text-gray-600 underline" onClick={() => setShowSettings(s => !s)}>
            {showSettings ? 'Hide settings' : 'Settings'}
          </button>
          <select value={level} onChange={e => { setLevel(e.target.value); setSelectedItems([]) }} className="border rounded px-2 py-1">
            <option value="state">States</option>
            <option value="county">Counties</option>
          </select>
          <input value={name} onChange={e => setName(e.target.value)} className="border rounded px-2 py-1" placeholder="Selection name" />
          <button onClick={saveSelection} disabled={saving || !selectedItems.length || !backendUrl} className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </header>

      {showSettings && (
        <div className="border-b bg-gray-50 px-4 py-3 grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-2">
            <label className="w-40 text-sm text-gray-700">Google Maps API key</label>
            <input className="flex-1 border rounded px-2 py-1" placeholder="Paste your key" value={apiKey} onChange={e => setApiKey(e.target.value.trim())} />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-40 text-sm text-gray-700">Backend URL</label>
            <input className="flex-1 border rounded px-2 py-1" placeholder="https://your-backend" value={backendUrl} onChange={e => setBackendUrl(e.target.value.trim())} />
          </div>
          <div className="md:col-span-2 text-xs text-gray-500">
            Tips: You can also supply these via URL params: ?gmaps_key=YOUR_KEY&backend=https://your-backend. Values are saved in your browser.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[320px,1fr]">
        <aside className="p-4 border-r space-y-4 bg-white">
          <div>
            <div className="text-sm font-medium mb-2">Choose {level === 'state' ? 'states' : 'counties'}</div>
            <div className="text-xs text-gray-500 mb-2">Tip: Click directly on the map to toggle a {level === 'state' ? 'state' : 'county'}.</div>
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
            {!backendUrl && (
              <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded mb-2">
                Set your backend URL in Settings to enable save and export.
              </div>
            )}
            <div className="space-y-2">
              {saved.map(s => (
                <div key={s.id} className="border rounded p-2">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.level} • {s.items?.length || 0} items</div>
                  <div className="flex gap-2 mt-2">
                    <a className="text-blue-600 text-xs hover:underline" href={`${backendUrl}/api/selections/${s.id}/export.csv`} target="_blank" rel="noreferrer">Export CSV</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <main className="relative">
          {!apiKey && (
            <div className="absolute inset-0 z-10 bg-yellow-50 border-b border-yellow-200 p-3 text-sm text-yellow-900">
              Add a Google Maps API key in Settings or via URL param gmaps_key to enable map rendering.
            </div>
          )}
          {hint && (
            <div className="absolute top-2 left-2 z-20 bg-white/90 border rounded px-2 py-1 text-xs text-gray-700 shadow">
              {hint}
            </div>
          )}
          <div ref={mapRef} className="w-full h-[70vh] md:h-full" />
        </main>
      </div>
    </div>
  )
}

export default App
