import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, 
  Activity, 
  Settings, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Edit, 
  Shield, 
  Phone, 
  Bell, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Key, 
  Clock, 
  Cpu, 
  HardDrive, 
  Link,
  Wifi,
  WifiOff
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'settings'
  const [vms, setVms] = useState([]);
  const [whatsapp, setWhatsapp] = useState({ enabled: false, status: 'disconnected', qr: null });
  const [settings, setSettings] = useState({
    whatsapp_enabled: 'false',
    alert_phone: '',
    threshold_cpu: '90',
    threshold_ram: '90',
    threshold_disk: '90',
    polling_interval: '30'
  });
  const [alerts, setAlerts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [selectedVm, setSelectedVm] = useState(null);

  // Form State for Adding/Editing VM
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    type: 'ssh',
    port: '22',
    username: '',
    auth_method: 'password',
    password_or_key: ''
  });

  const [formError, setFormError] = useState('');
  const [isPollerLoading, setIsPollerLoading] = useState(false);

  const wsRef = useRef(null);

  // Fetch initial REST data
  useEffect(() => {
    fetchVms();
    fetchSettings();
    fetchAlerts();

    // Establish WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = window.location.port === '5173' 
      ? 'ws://localhost:3000' 
      : `${protocol}//${window.location.host}`;

    const connectWs = () => {
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'vms_update') {
            setVms(message.payload);
          } else if (message.type === 'whatsapp_status') {
            setWhatsapp(message.payload);
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected. Attempting reconnection in 3 seconds...');
        setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const fetchVms = async () => {
    try {
      const res = await fetch('/api/vms');
      const data = await res.json();
      if (res.ok) setVms(data);
    } catch (err) {
      console.error('Error fetching VMs:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (res.ok) setSettings(data);
    } catch (err) {
      console.error('Error fetching Settings:', err);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (res.ok) setAlerts(data);
    } catch (err) {
      console.error('Error fetching Alerts:', err);
    }
  };

  // Toggle VM type in form
  const handleTypeChange = (e) => {
    const type = e.target.value;
    setFormData(prev => ({
      ...prev,
      type,
      port: type === 'ssh' ? '22' : '5001',
      username: type === 'ssh' ? 'root' : ''
    }));
  };

  // Open VM modal
  const openVmModal = (mode, vm = null) => {
    setModalMode(mode);
    setFormError('');
    if (mode === 'edit' && vm) {
      setSelectedVm(vm);
      setFormData({
        name: vm.name,
        host: vm.host,
        type: vm.type,
        port: String(vm.port),
        username: vm.username || '',
        auth_method: vm.auth_method || 'password',
        password_or_key: vm.password_or_key || ''
      });
    } else {
      setSelectedVm(null);
      setFormData({
        name: '',
        host: '',
        type: 'ssh',
        port: '22',
        username: 'root',
        auth_method: 'password',
        password_or_key: ''
      });
    }
    setIsModalOpen(true);
  };

  // Save VM (Add or Edit)
  const handleSaveVm = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim() || !formData.host.trim() || !formData.port.trim()) {
      setFormError('Please fill out all required fields.');
      return;
    }

    const payload = {
      ...formData,
      port: parseInt(formData.port)
    };

    const url = modalMode === 'add' ? '/api/vms' : `/api/vms/${selectedVm.id}`;
    const method = modalMode === 'add' ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        setIsModalOpen(false);
        fetchVms();
        fetchAlerts();
      } else {
        setFormError(data.error || 'Failed to save VM configuration.');
      }
    } catch (err) {
      setFormError('Failed to communicate with backend server.');
    }
  };

  // Delete VM
  const handleDeleteVm = async (id) => {
    if (!confirm('Are you sure you want to delete this Virtual Machine?')) return;
    try {
      const res = await fetch(`/api/vms/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchVms();
        fetchAlerts();
      }
    } catch (err) {
      console.error('Error deleting VM:', err);
    }
  };

  // Manual Poll
  const handleManualPoll = async (id = null) => {
    setIsPollerLoading(true);
    const url = id ? `/api/vms/${id}/poll` : '/api/vms/poll';
    try {
      await fetch(url, { method: 'POST' });
      fetchVms();
      fetchAlerts();
    } catch (err) {
      console.error('Error polling VM(s):', err);
    } finally {
      setIsPollerLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert('Settings saved successfully!');
        fetchSettings();
        // If enabling WhatsApp, hit status to trigger connection initialization on server
        if (settings.whatsapp_enabled === 'true') {
          // Trigger reboot/init of WhatsApp on backend
          // We can restart backend process or simply re-fetch status
          fetch('/api/whatsapp/status');
        }
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  const handleSettingChange = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  // Format Bytes into GB
  const formatGb = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  // Format Uptime (Seconds to Days/Hours)
  const formatUptime = (seconds) => {
    if (!seconds || isNaN(seconds)) return 'Unknown';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Helper to determine threshold classes
  const getProgressBarClass = (percent, threshold) => {
    const limit = parseFloat(threshold) || 90;
    if (percent >= limit) return 'progress-bar critical';
    if (percent >= limit - 15) return 'progress-bar warning';
    return 'progress-bar normal';
  };

  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="header">
        <div className="header-title-area">
          <span className="header-logo">🖥️</span>
          <div className="header-title-text">
            <h1>OctaShield</h1>
            <p>Virtualized Host Monitoring Control Panel</p>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="nav-tabs">
            <button 
              className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <Activity size={16} />
              Dashboard
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} />
              Configurations
            </button>
          </div>

          <button 
            className="btn btn-primary"
            onClick={() => openVmModal('add')}
          >
            <Plus size={16} />
            Register VM
          </button>
        </div>
      </header>

      {/* Tab Contents */}
      {activeTab === 'dashboard' ? (
        <div>
          {/* Quick Stats Panel */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div className="glass-card" style={{ flex: '1 1 200px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(129, 140, 248, 0.1)', color: '#818cf8', padding: '0.75rem', borderRadius: '12px' }}>
                <Server size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Registered VMs</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{vms.length}</div>
              </div>
            </div>
            
            <div className="glass-card" style={{ flex: '1 1 200px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.75rem', borderRadius: '12px' }}>
                <Wifi size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Online VMs</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {vms.filter(v => v.status === 'online').length}
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ flex: '1 1 200px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', padding: '0.75rem', borderRadius: '12px' }}>
                <WifiOff size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Offline VMs</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {vms.filter(v => v.status !== 'online').length}
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ flex: '1 1 250px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                background: whatsapp.status === 'connected' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)', 
                color: whatsapp.status === 'connected' ? '#10b981' : '#f43f5e', 
                padding: '0.75rem', 
                borderRadius: '12px' 
              }}>
                <Phone size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>WhatsApp Automation</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'capitalize', color: whatsapp.status === 'connected' ? '#10b981' : '#f43f5e' }}>
                  {whatsapp.status === 'connected' ? '🟢 Link Established' : `🔴 ${whatsapp.status}`}
                </div>
              </div>
            </div>
            
            <button 
              className="btn btn-secondary"
              style={{ flex: '0 0 auto', padding: '1rem' }}
              onClick={() => handleManualPoll()}
              disabled={isPollerLoading || vms.length === 0}
            >
              <RefreshCw className={isPollerLoading ? 'spin-anim' : ''} size={18} />
              {isPollerLoading ? 'Polling...' : 'Sync Metrics'}
            </button>
          </div>

          {/* VMs Grid */}
          <div className="vm-grid">
            {vms.length === 0 ? (
              <div className="empty-state glass-card">
                <span className="empty-state-icon">🖥️</span>
                <h3>No Host VMs Tracked</h3>
                <p>Register your first Linux (SSH) or Windows/Linux (Agent) server using the button above to begin tracking metrics.</p>
                <button className="btn btn-primary" onClick={() => openVmModal('add')}>
                  <Plus size={16} /> Add Host VM
                </button>
              </div>
            ) : (
              vms.map(vm => (
                <div key={vm.id} className="glass-card vm-card">
                  {/* Card Header */}
                  <div className="vm-card-header">
                    <div className="vm-title-area">
                      <div className="vm-name">{vm.name}</div>
                      <div className="vm-host">{vm.host}:{vm.port}</div>
                    </div>
                    <span className={`status-badge ${vm.status === 'online' ? 'online' : 'offline'}`}>
                      <span className="status-dot"></span>
                      {vm.status}
                    </span>
                  </div>

                  {/* Card Body Metrics */}
                  <div className="vm-card-body">
                    {vm.status === 'online' && vm.metrics ? (
                      <>
                        {/* CPU usage */}
                        <div className="metric-row">
                          <div className="metric-label-container">
                            <span>Processor Load</span>
                            <span className="metric-value">{vm.metrics.cpu}%</span>
                          </div>
                          <div className="progress-track">
                            <div 
                              className={getProgressBarClass(vm.metrics.cpu, settings.threshold_cpu)}
                              style={{ width: `${vm.metrics.cpu}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* RAM usage */}
                        <div className="metric-row">
                          <div className="metric-label-container">
                            <span>Memory Utilization</span>
                            <span className="metric-value">{vm.metrics.ram.percent}%</span>
                          </div>
                          <div className="progress-track">
                            <div 
                              className={getProgressBarClass(vm.metrics.ram.percent, settings.threshold_ram)}
                              style={{ width: `${vm.metrics.ram.percent}%` }}
                            ></div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                            {formatGb(vm.metrics.ram.used)} / {formatGb(vm.metrics.ram.total)}
                          </div>
                        </div>

                        {/* Storage usage */}
                        <div className="metric-row">
                          <div className="metric-label-container">
                            <span>Storage space</span>
                            <span className="metric-value">{vm.metrics.disk.percent}%</span>
                          </div>
                          <div className="progress-track">
                            <div 
                              className={getProgressBarClass(vm.metrics.disk.percent, settings.threshold_disk)}
                              style={{ width: `${vm.metrics.disk.percent}%` }}
                            ></div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                            {formatGb(vm.metrics.disk.used)} / {formatGb(vm.metrics.disk.total)}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '140px', color: 'var(--text-dim)' }}>
                        <WifiOff size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                        <span>Metrics Unavailable</span>
                        <span style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Host is offline or unreachable</span>
                      </div>
                    )}
                  </div>

                  {/* Metadata Footer */}
                  <div className="vm-meta-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} />
                      Uptime: {vm.status === 'online' && vm.metrics ? formatUptime(vm.metrics.uptime) : 'N/A'}
                    </div>
                    <div>
                      Checked: {vm.last_checked ? new Date(vm.last_checked).toLocaleTimeString() : 'Never'}
                    </div>
                  </div>

                  {/* Actions Overlay */}
                  <div className="vm-actions-overlay">
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                      title="Poll Node Details"
                      onClick={() => handleManualPoll(vm.id)}
                      disabled={isPollerLoading}
                    >
                      <RefreshCw size={12} />
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                      title="Edit Configuration"
                      onClick={() => openVmModal('edit', vm)}
                    >
                      <Edit size={12} />
                    </button>
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                      title="Remove Host Node"
                      onClick={() => handleDeleteVm(vm.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Settings Tab View */
        <div className="settings-grid">
          {/* Settings Parameters Form */}
          <div className="glass-card settings-card">
            <h2 className="settings-title">
              <Shield size={20} style={{ color: 'var(--accent-purple)' }} />
              Monitoring Configurations
            </h2>

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Metric Polling Frequency (seconds)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  min="5" 
                  max="300"
                  value={settings.polling_interval || '30'}
                  onChange={(e) => handleSettingChange('polling_interval', e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">CPU Warning Threshold (%)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="10" 
                    max="99"
                    value={settings.threshold_cpu || '90'}
                    onChange={(e) => handleSettingChange('threshold_cpu', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">RAM Warning Threshold (%)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="10" 
                    max="99"
                    value={settings.threshold_ram || '90'}
                    onChange={(e) => handleSettingChange('threshold_ram', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Storage Critical Threshold (%)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  min="10" 
                  max="99"
                  value={settings.threshold_disk || '90'}
                  onChange={(e) => handleSettingChange('threshold_disk', e.target.value)}
                />
              </div>

              <div className="switch-container">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>Enable WhatsApp Alerts</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Send push messages to WhatsApp when thresholds exceed</div>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox"
                    checked={settings.whatsapp_enabled === 'true'}
                    onChange={(e) => handleSettingChange('whatsapp_enabled', e.target.checked ? 'true' : 'false')}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">
                  WhatsApp Alert Recipient (User Phone or Group ID)
                </label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. +94771234567 or 120363028392019@g.us"
                  value={settings.alert_phone || ''}
                  onChange={(e) => handleSettingChange('alert_phone', e.target.value)}
                  disabled={settings.whatsapp_enabled !== 'true'}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  Use country code without '+' or spaces. Group IDs must end with @g.us.
                </span>
              </div>

              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                Save Configurations
              </button>
            </form>
          </div>

          {/* WhatsApp Linkage & Recent Logs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* WhatsApp Linkage */}
            <div className="glass-card settings-card">
              <h2 className="settings-title">
                <Phone size={20} style={{ color: '#10b981' }} />
                WhatsApp Linkage Status
              </h2>

              {settings.whatsapp_enabled === 'true' ? (
                <div className="whatsapp-panel">
                  {whatsapp.status === 'connected' ? (
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={48} style={{ color: 'var(--color-online)' }} />
                      <span className="whatsapp-status-indicator" style={{ color: 'var(--color-online)' }}>
                        🟢 Active Connection
                      </span>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Bot account is ready. Send <b>!status</b> to your bot phone number to test interactive commands.
                      </p>
                    </div>
                  ) : whatsapp.status === 'qr' && whatsapp.qr ? (
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
                      <div className="whatsapp-qr-container">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(whatsapp.qr)}`} 
                          alt="WhatsApp Linking QR Code" 
                          width="200" 
                          height="200" 
                        />
                        <div className="scanner-laser"></div>
                      </div>
                      <span className="whatsapp-status-indicator" style={{ color: 'var(--color-warning)' }}>
                        🟡 Action Required: Link Device
                      </span>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
                        Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device, and scan the QR code above.
                      </p>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '2rem 0' }}>
                      <RefreshCw size={36} className="spin-anim" style={{ color: 'var(--text-muted)' }} />
                      <span className="whatsapp-status-indicator" style={{ color: 'var(--text-muted)' }}>
                        Connecting to Gateway...
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <WifiOff size={40} style={{ opacity: 0.5 }} />
                  <h4>Alert Gateway Disabled</h4>
                  <p style={{ fontSize: '0.8rem', maxWidth: '300px' }}>Toggle the "Enable WhatsApp Alerts" switch on the left config panel to activate the WhatsApp client.</p>
                </div>
              )}
            </div>

            {/* Audit / Alerts Log */}
            <div className="glass-card settings-card" style={{ flexGrow: 1 }}>
              <h2 className="settings-title">
                <Bell size={20} style={{ color: '#ff3366' }} />
                Historical Alert Logs
              </h2>

              <div className="logs-panel">
                {alerts.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2.5rem 0', fontSize: '0.85rem' }}>
                    No alerts have been recorded.
                  </div>
                ) : (
                  alerts.map(log => (
                    <div key={log.id} className="log-item">
                      <div className="log-meta">
                        <span className="log-type-icon">
                          {log.status === 'triggered' ? (
                            log.metric === 'connection' ? '🔴' : '⚠️'
                          ) : '🟢'}
                        </span>
                        <div>
                          <div className="log-vm-name">{log.vm_name}</div>
                          <div className="log-description">
                            {log.metric === 'connection' 
                              ? (log.status === 'triggered' ? 'VM disconnected' : 'VM reconnected')
                              : `${log.metric.toUpperCase()} ${log.status === 'triggered' ? 'exceeded limit' : 'recovered'} at ${log.value}%`
                            }
                          </div>
                        </div>
                      </div>
                      <div className="log-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VM Edit/Add Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {modalMode === 'add' ? 'Register Virtual Machine' : 'Modify VM Connection'}
              </h3>
              <button 
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                onClick={() => setIsModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveVm}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#fda4af', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <AlertTriangle size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">VM Identifier Name *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Ubuntu-Web-Server"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Connection Host / IP *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. 192.168.1.15"
                      value={formData.host}
                      onChange={(e) => setFormData(prev => ({ ...prev, host: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Protocol Type *</label>
                    <select 
                      className="form-select"
                      value={formData.type}
                      onChange={handleTypeChange}
                    >
                      <option value="ssh">SSH (Linux Agentless)</option>
                      <option value="agent">Agent (HTTP Port)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Target Port *</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={formData.port}
                    onChange={(e) => setFormData(prev => ({ ...prev, port: e.target.value }))}
                    required
                  />
                </div>

                {formData.type === 'ssh' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">SSH Username *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={formData.username}
                          onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                          required={formData.type === 'ssh'}
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="form-label">SSH Auth Method</label>
                        <select 
                          className="form-select"
                          value={formData.auth_method}
                          onChange={(e) => setFormData(prev => ({ ...prev, auth_method: e.target.value }))}
                        >
                          <option value="password">Password Credentials</option>
                          <option value="key">Private SSH Key File</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        {formData.auth_method === 'password' ? 'SSH Account Password' : 'SSH Private Key Content'}
                      </label>
                      {formData.auth_method === 'password' ? (
                        <input 
                          type="password" 
                          className="form-input" 
                          placeholder="••••••••••••••"
                          value={formData.password_or_key}
                          onChange={(e) => setFormData(prev => ({ ...prev, password_or_key: e.target.value }))}
                        />
                      ) : (
                        <textarea 
                          className="form-input" 
                          rows="5"
                          style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                          value={formData.password_or_key}
                          onChange={(e) => setFormData(prev => ({ ...prev, password_or_key: e.target.value }))}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'add' ? 'Confirm Registration' : 'Update Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global CSS spinner rule inject */}
      <style>{`
        .spin-anim {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
