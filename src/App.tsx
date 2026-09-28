import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  createCloudLiveCode,
  deleteCloudLiveCode,
  listCloudLiveCodes,
  updateCloudLiveCode,
} from './lib/cloudApi'
import type { LiveCode } from './lib/liveCodes'
import {
  buildLiveCodeUrl,
  recordVisit,
  resolveLiveCode,
  saveLiveCodes,
  selectRandomTarget,
} from './lib/liveCodes'
import {
  ADMIN_PATH,
  clearAdminToken,
  getStoredAdminToken,
  isAdminPath,
  rememberAdminToken,
} from './lib/adminAuth'

type FormState = {
  name: string
  targetUrls: string[]
}

type LoginPageProps = {
  initialToken: string
  busy: boolean
  error: string | null
  onSubmit: (token: string, remember: boolean) => void
}

type AccessState = 'redirecting' | 'missing' | 'disabled'

const emptyForm: FormState = { name: '', targetUrls: [''] }

function getStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window[kind]
}

function parseAccessCode(pathname: string): string | null {
  const match = pathname.match(/^\/go\/([^/]+)$/)
  if (!match) {
    return null
  }

  try {
    return decodeURIComponent(match[1]).trim().toUpperCase() || null
  } catch {
    return null
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) {
    throw new Error('copy failed')
  }
}

function UnavailableView() {
  return (
    <main className="access-page">
      <div className="access-mark">LC</div>
      <p className="eyebrow">LIVE CODE</p>
      <h1>页面不存在</h1>
      <p>请输入管理入口地址访问系统。</p>
    </main>
  )
}

function AccessView({ state, code }: { state: AccessState; code: string }) {
  const title = state === 'redirecting' ? '正在跳转' : state === 'disabled' ? '活码已停用' : '活码不存在'
  const description = state === 'redirecting' ? '请稍候' : `短码 ${code} 当前不可用`

  return (
    <main className="access-page">
      <div className="access-mark">LC</div>
      <p className="eyebrow">LIVE CODE</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </main>
  )
}

function LocalAccessRoute({ code }: { code: string }) {
  const storage = getStorage('localStorage')
  const [state, setState] = useState<AccessState>('redirecting')
  const [codes] = useState(() => {
    try {
      const raw = storage?.getItem('live-code-system.codes.v1')
      return raw ? JSON.parse(raw) as LiveCode[] : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    const liveCode = resolveLiveCode(codes, code)
    if (!liveCode) {
      setState(codes.some((item) => item.code === code) ? 'disabled' : 'missing')
      return
    }

    saveLiveCodes(storage, recordVisit(codes, code))
    setState('redirecting')
    window.location.href = selectRandomTarget(liveCode.targetUrls)
  }, [code, codes, storage])

  return <AccessView state={state} code={code} />
}

function LoginPage({ initialToken, busy, error, onSubmit }: LoginPageProps) {
  const [token, setToken] = useState(initialToken)
  const [remember, setRemember] = useState(false)

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__header">
          <div className="brand-mark">LC</div>
          <div>
            <p className="eyebrow">RESTRICTED CONTROL ROOM</p>
            <h1>后台管理登录</h1>
          </div>
        </div>
        <p className="auth-copy">请输入 Cloudflare Pages Secret 中配置的后台口令，验证通过后才能进入活码管理台。</p>
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); onSubmit(token, remember) }}>
          <label className="field">
            <span>后台口令</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="输入 ADMIN_TOKEN"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <label className="remember-option">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span>记住此设备</span>
          </label>
          {error ? <p className="form-message is-error">{error}</p> : null}
          <button type="submit" className="button button-primary" disabled={busy || !token.trim()}>
            {busy ? '验证中' : '验证并进入后台'}
          </button>
        </form>
        <div className="auth-footer">
          <span className="status-dot is-live" />
          <span>Cloudflare Pages / KV 管理入口</span>
        </div>
      </section>
      <aside className="auth-aside">
        <p className="eyebrow">ACCESS POLICY</p>
        <h2>公开跳转与后台管理分离</h2>
        <p>访问公开短链不需要口令；只有 {ADMIN_PATH} 会显示管理登录页。</p>
        <ul>
          <li>口令由 Pages Secret 校验</li>
          <li>错误口令不会读取 KV 数据</li>
          <li>退出后清理当前设备的登录状态</li>
        </ul>
      </aside>
    </main>
  )
}

function AdminGate() {
  const sessionStorage = getStorage('sessionStorage')
  const localStorage = getStorage('localStorage')
  const storedToken = getStoredAdminToken(sessionStorage, localStorage)
  const [adminToken, setAdminToken] = useState('')
  const [tokenInput, setTokenInput] = useState(storedToken)
  const [codes, setCodes] = useState<LiveCode[]>([])
  const [busy, setBusy] = useState(Boolean(storedToken))
  const [error, setError] = useState<string | null>(null)

  const authenticate = async (candidate: string, remember: boolean) => {
    const token = candidate.trim()
    if (!token) {
      setError('请输入后台口令')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const remoteCodes = await listCloudLiveCodes(token)
      rememberAdminToken(token, remember, sessionStorage, localStorage)
      setCodes(remoteCodes)
      setAdminToken(token)
    } catch {
      clearAdminToken(sessionStorage, localStorage)
      setAdminToken('')
      setError('口令错误，或 Cloudflare ADMIN_TOKEN 尚未配置')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!storedToken) {
      return
    }

    void authenticate(storedToken, localStorage?.getItem('live-code-system.admin-token') !== null)
  }, [])

  if (adminToken) {
    return (
      <AdminManager
        adminToken={adminToken}
        initialCodes={codes}
        onLogout={() => {
          clearAdminToken(sessionStorage, localStorage)
          setAdminToken('')
          setTokenInput('')
          setCodes([])
        }}
      />
    )
  }

  return <LoginPage initialToken={tokenInput} busy={busy} error={error} onSubmit={(token, remember) => { setTokenInput(token); void authenticate(token, remember) }} />
}

function AdminManager({
  adminToken,
  initialCodes,
  onLogout,
}: {
  adminToken: string
  initialCodes: LiveCode[]
  onLogout: () => void
}) {
  const [codes, setCodes] = useState(initialCodes)
  const [selectedId, setSelectedId] = useState<string | null>(initialCodes[0]?.id ?? null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [mode, setMode] = useState<'create' | 'edit'>(initialCodes.length ? 'edit' : 'create')
  const [query, setQuery] = useState('')
  const [qrMarkup, setQrMarkup] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedCode = codes.find((item) => item.id === selectedId) ?? null
  const filteredCodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return codes
    return codes.filter((item) => `${item.name} ${item.code} ${item.targetUrls.join(' ')}`.toLowerCase().includes(normalizedQuery))
  }, [codes, query])
  const selectedUrl = selectedCode ? buildLiveCodeUrl(selectedCode.code) : ''
  const totalVisits = codes.reduce((total, item) => total + item.visits, 0)
  const activeCount = codes.filter((item) => item.enabled).length

  useEffect(() => {
    if (!selectedCode) {
      setForm(emptyForm)
      setMode('create')
      return
    }

    setForm({ name: selectedCode.name, targetUrls: selectedCode.targetUrls })
    setMode('edit')
  }, [selectedCode?.id, selectedCode?.updatedAt])

  useEffect(() => {
    if (!selectedCode) {
      setQrMarkup('')
      return
    }

    let cancelled = false
    void QRCode.toString(selectedUrl, {
      type: 'svg',
      margin: 1,
      width: 240,
      color: { dark: '#142126', light: '#ffffff' },
    }).then((markup) => {
      if (!cancelled) setQrMarkup(markup)
    }).catch(() => {
      if (!cancelled) setQrMarkup('')
    })

    return () => { cancelled = true }
  }, [selectedCode?.id, selectedUrl])

  const persist = (next: LiveCode[]) => {
    setCodes(next)
    setNotice(null)
    setError(null)
  }

  const updateTarget = (index: number, value: string) => {
    setForm((current) => ({ ...current, targetUrls: current.targetUrls.map((target, targetIndex) => targetIndex === index ? value : target) }))
  }

  const removeTarget = (index: number) => {
    setForm((current) => ({
      ...current,
      targetUrls: current.targetUrls.length > 1 ? current.targetUrls.filter((_, targetIndex) => targetIndex !== index) : current.targetUrls,
    }))
  }

  const handleSubmit = async () => {
    setError(null)
    setNotice(null)
    try {
      if (selectedCode && mode === 'edit') {
        const updated = await updateCloudLiveCode(adminToken, selectedCode.code, form)
        persist(codes.map((item) => item.id === updated.id ? updated : item))
        setNotice('活码已保存')
        return
      }

      const created = await createCloudLiveCode(adminToken, form)
      persist([created, ...codes])
      setSelectedId(created.id)
      setMode('edit')
      setNotice('活码已创建')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败')
    }
  }

  const handleToggle = async () => {
    if (!selectedCode) return
    try {
      const updated = await updateCloudLiveCode(adminToken, selectedCode.code, {
        name: selectedCode.name,
        targetUrls: selectedCode.targetUrls,
        enabled: !selectedCode.enabled,
      })
      persist(codes.map((item) => item.id === updated.id ? updated : item))
      setNotice(selectedCode.enabled ? '活码已停用' : '活码已启用')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '切换状态失败')
    }
  }

  const handleDelete = async () => {
    if (!selectedCode || !window.confirm(`确定删除“${selectedCode.name}”吗？`)) return
    try {
      await deleteCloudLiveCode(adminToken, selectedCode.code)
      const next = codes.filter((item) => item.id !== selectedCode.id)
      setCodes(next)
      setSelectedId(next[0]?.id ?? null)
      setNotice('活码已删除')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败')
    }
  }

  const handleCopy = async (value: string, label: string) => {
    try {
      await copyText(value)
      setNotice(`${label}已复制`)
    } catch {
      setError('复制失败，请手动选择地址')
    }
  }

  const handleDownload = () => {
    if (!selectedCode || !qrMarkup) return
    const url = URL.createObjectURL(new Blob([qrMarkup], { type: 'image/svg+xml' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${selectedCode.code}.svg`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('二维码已下载')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">LC</div>
          <p className="eyebrow">LIVE CODE / ADMIN</p>
          <h1>活码台</h1>
          <p className="sidebar-copy">受保护的链接管理</p>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          <span className="nav-item is-active">活码管理 <small>{codes.length}</small></span>
        </nav>
        <div className="sidebar-bottom"><span className="live-dot" /> Cloudflare KV</div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">CONTROL ROOM / 01</p><h2>活码管理</h2></div>
          <div className="topbar-actions">
            <span className="auth-badge"><span className="status-dot is-live" /> 已验证</span>
            <button type="button" className="button button-quiet" onClick={onLogout}>退出登录</button>
            <button type="button" className="button button-primary" onClick={() => { setSelectedId(null); setForm(emptyForm); setMode('create'); setNotice(null); setError(null) }}>＋ 新建活码</button>
          </div>
        </header>
        <section className="content-wrap">
          <div className="metric-row" aria-label="数据概览">
            <div className="metric-block"><span>全部活码</span><strong>{codes.length}</strong><small>条记录</small></div>
            <div className="metric-block"><span>运行中</span><strong>{activeCount}</strong><small>条启用</small></div>
            <div className="metric-block"><span>累计访问</span><strong>{totalVisits.toLocaleString('zh-CN')}</strong><small>次跳转</small></div>
            <div className="metric-block metric-block--accent"><span>后台状态</span><strong>SECURE</strong><small>口令已验证</small></div>
          </div>
          <div className="workspace-grid">
            <section className="panel list-panel">
              <div className="panel-heading"><div><p className="eyebrow">DIRECTORY</p><h3>活码列表</h3></div><span className="count-label">{filteredCodes.length} / {codes.length}</span></div>
              <label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、短码或地址" /></label>
              <div className="code-list">
                {filteredCodes.map((code) => (
                  <button type="button" key={code.id} className={`code-row ${code.id === selectedId ? 'is-selected' : ''}`} onClick={() => setSelectedId(code.id)}>
                    <span className={`status-dot ${code.enabled ? 'is-live' : ''}`} />
                    <span className="code-row-main"><strong>{code.name}</strong><small>{code.code} · {code.visits.toLocaleString('zh-CN')} 次访问</small></span>
                    <span className="row-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
                {filteredCodes.length === 0 ? <div className="empty-list"><span className="empty-icon">＋</span><strong>{codes.length ? '没有匹配结果' : '还没有活码'}</strong><small>{codes.length ? '换个关键词试试' : '创建第一条活码开始管理'}</small></div> : null}
              </div>
            </section>
            <section className="panel editor-panel">
              <div className="panel-heading panel-heading--editor"><div><p className="eyebrow">{mode === 'edit' ? 'EDIT LIVE CODE' : 'NEW LIVE CODE'}</p><h3>{mode === 'edit' ? '编辑活码' : '创建活码'}</h3></div>{selectedCode ? <span className={`state-pill ${selectedCode.enabled ? 'is-live' : ''}`}>{selectedCode.enabled ? '启用中' : '已停用'}</span> : null}</div>
              <div className="editor-body">
                <div className="form-section">
                  <label className="field"><span>名称</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：春季活动入口" autoComplete="off" /></label>
                  <div className="field"><span>目标地址（多条时随机）</span><div className="target-input-list">
                    {form.targetUrls.map((targetUrl, index) => <div className="target-input-row" key={`target-${index}`}><input value={targetUrl} onChange={(event) => updateTarget(index, event.target.value)} placeholder="https://example.com/campaign" aria-label={`目标地址 ${index + 1}`} inputMode="url" autoComplete="off" /><button type="button" className="button button-small" onClick={() => removeTarget(index)} disabled={form.targetUrls.length === 1}>删除</button></div>)}
                    <button type="button" className="button button-small target-add-button" onClick={() => setForm((current) => ({ ...current, targetUrls: [...current.targetUrls, ''] }))}>＋ 添加目标地址</button>
                  </div></div>
                  {error ? <p className="form-message is-error">{error}</p> : null}
                  {notice ? <p className="form-message is-success">{notice}</p> : null}
                  <div className="form-actions"><button type="button" className="button button-primary" onClick={() => void handleSubmit()}>{mode === 'edit' ? '保存修改' : '创建活码'}</button>{selectedCode ? <button type="button" className="button button-quiet" onClick={() => void handleToggle()}>{selectedCode.enabled ? '停用' : '启用'}</button> : null}{selectedCode ? <button type="button" className="button button-danger" onClick={() => void handleDelete()}>删除</button> : null}</div>
                </div>
                {selectedCode ? <div className="qr-section"><div className="qr-preview">{qrMarkup ? <div className="qr-code" dangerouslySetInnerHTML={{ __html: qrMarkup }} /> : <div className="qr-loading">生成中</div>}</div><div className="qr-meta"><span>活码地址</span><code>{selectedUrl}</code><div className="qr-actions"><button type="button" className="button button-small" onClick={() => void handleCopy(selectedUrl, '活码地址')}>复制地址</button><button type="button" className="button button-small" onClick={handleDownload} disabled={!qrMarkup}>下载 SVG</button></div></div><dl className="detail-list"><div><dt>短码</dt><dd>{selectedCode.code}</dd></div><div><dt>访问次数</dt><dd>{selectedCode.visits.toLocaleString('zh-CN')}</dd></div><div><dt>最近更新</dt><dd>{formatDate(selectedCode.updatedAt)}</dd></div></dl><button type="button" className="target-link" onClick={() => void handleCopy(selectedCode.targetUrl, '目标地址')}><span>{selectedCode.targetUrls.length > 1 ? '随机目标' : '当前目标'}</span><strong>{selectedCode.targetUrl}</strong><span aria-hidden="true">↗</span></button></div> : <div className="qr-section qr-section--empty"><div className="empty-qr">QR</div><strong>保存后生成二维码</strong><small>二维码地址固定，目标地址可随时更新</small></div>}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}

function App() {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname
  const accessCode = parseAccessCode(pathname)
  if (accessCode) return <LocalAccessRoute code={accessCode} />
  if (!isAdminPath(pathname)) return <UnavailableView />
  return <AdminGate />
}

export default App
