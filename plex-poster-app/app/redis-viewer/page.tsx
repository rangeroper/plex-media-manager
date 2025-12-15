"use client"

import { useState, useEffect } from 'react'
import { RefreshCw, Search, Database, Key, Eye, EyeOff } from 'lucide-react'

export default function RedisViewerPage() {
  const [keys, setKeys] = useState<string[]>([])
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedKeys, setExpandedKeys] = useState(new Set<string>())

  const fetchRedisData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/debug/redis')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      const result = await response.json()
      setKeys(result.keys || [])
      setData(result.data || {})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('Failed to fetch Redis data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRedisData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(fetchRedisData, 2000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const filteredKeys = keys.filter(key => 
    key.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedKeys)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedKeys(newExpanded)
  }

  const formatValue = (value: any) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return value
      }
    }
    return JSON.stringify(value, null, 2)
  }

  const getKeyColor = (key: string) => {
    if (key.startsWith('items:')) return 'text-blue-400'
    if (key.startsWith('job:')) return 'text-green-400'
    if (key.startsWith('config:')) return 'text-purple-400'
    if (key.startsWith('library:')) return 'text-yellow-400'
    return 'text-gray-400'
  }

  const getKeyIcon = (key: string) => {
    if (key.startsWith('items:')) return '📦'
    if (key.startsWith('job:')) return '⚙️'
    if (key.startsWith('config:')) return '⚙️'
    if (key.startsWith('library:')) return '📚'
    return '🔑'
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-red-400" />
            <div>
              <h1 className="text-3xl font-bold">Redis Live Viewer</h1>
              <p className="text-gray-400 text-sm">Real-time database monitoring</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                autoRefresh 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {autoRefresh ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
            </button>
            
            <button
              onClick={fetchRedisData}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg flex items-center gap-2 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-gray-400 text-sm">Total Keys</div>
            <div className="text-2xl font-bold text-white">{keys.length}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-gray-400 text-sm">Items Keys</div>
            <div className="text-2xl font-bold text-blue-400">
              {keys.filter(k => k.startsWith('items:')).length}
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-gray-400 text-sm">Job Keys</div>
            <div className="text-2xl font-bold text-green-400">
              {keys.filter(k => k.startsWith('job:')).length}
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-gray-400 text-sm">Other Keys</div>
            <div className="text-2xl font-bold text-purple-400">
              {keys.filter(k => !k.startsWith('items:') && !k.startsWith('job:')).length}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search keys..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Keys List */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800 bg-gray-950">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Key className="w-5 h-5" />
              Keys ({filteredKeys.length})
            </h2>
          </div>
          
          <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
            {filteredKeys.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {loading ? 'Loading...' : 'No keys found'}
              </div>
            ) : (
              filteredKeys.map((key) => (
                <div key={key} className="hover:bg-gray-800/50 transition-colors">
                  <div
                    className="p-4 cursor-pointer flex items-center justify-between"
                    onClick={() => toggleExpand(key)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-xl">{getKeyIcon(key)}</span>
                      <code className={`font-mono text-sm ${getKeyColor(key)} truncate`}>
                        {key}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 px-2 py-1 bg-gray-800 rounded">
                        {typeof data[key] === 'string' ? `${data[key].length} chars` : 'object'}
                      </span>
                      <button className="text-gray-400 hover:text-white">
                        {expandedKeys.has(key) ? '▼' : '▶'}
                      </button>
                    </div>
                  </div>
                  
                  {expandedKeys.has(key) && (
                    <div className="px-4 pb-4 bg-gray-950">
                      <pre className="bg-black rounded-lg p-4 overflow-x-auto text-xs border border-gray-800">
                        <code className="text-green-400">
                          {formatValue(data[key])}
                        </code>
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          Last updated: {new Date().toLocaleTimeString()}
          {autoRefresh && ' • Auto-refreshing every 2 seconds'}
        </div>
      </div>
    </div>
  )
}