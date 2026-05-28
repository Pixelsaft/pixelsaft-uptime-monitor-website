async function loadData () {
  try {
    const response = await fetch(`./status.json?t=${Date.now()}`)
    const services = await response.json()

    updateServices(services)
    updateFooter(Date.now())
  } catch (error) {
    console.error('Error loading data:', error)
    const container = document.getElementById('app')
    container.removeAttribute('data-loading')
    container.innerHTML = 'Error loading data'
  }
}

function createServiceElement(service = null) {
  const template = document.getElementById('service-template')
  const element = template.content.cloneNode(true)

  if (service) {
    // Fill with real data
    element.querySelector('.status').textContent = service.status.isUp ? 'UP' : 'DOWN'
    element.querySelector('.status').className = `status ${service.status.isUp ? 'up' : 'down'}`
    element.querySelector('.service-name').textContent = service.config.address + (service.config.port ? ':' + service.config.port : '')
    element.querySelector('.service-type').textContent = getServiceType(service)
    element.querySelector('.uptime-main').textContent = `${service.stats['365d'].uptime.toFixed(2)}% (365d)`
    element.querySelector('.uptime-main').setAttribute('value', service.stats['365d'].uptime)
    element.querySelector('.uptime-detail').textContent = `${service.stats['30d'].uptime.toFixed(2)}% (30d)`
    element.querySelector('.uptime-detail').setAttribute('value', service.stats['30d'].uptime)

    // Populate extended data
    element.querySelector('.response-time').textContent = `${service.status.lastResultDuration}ms`
    element.querySelector('.last-check').textContent = formatDate(service.status.lastCheck * 1000)
    element.querySelector('.stats-all-time').replaceChildren(...formatPeriodStats(service.stats.allTime))
    element.querySelector('.stats-30d').replaceChildren(...formatPeriodStats(service.stats['30d']))
    element.querySelector('.stats-365d').replaceChildren(...formatPeriodStats(service.stats['365d']))
  }

  return element
}

function formatPeriodStats(stats) {
  if (!stats || typeof stats.uptime !== 'number' || typeof stats.coverage !== 'number') {
    return [document.createTextNode('Unknown')]
  }

  return [
    document.createTextNode(`${stats.uptime.toFixed(2)}% uptime`),
    document.createElement('br'),
    document.createTextNode(`from ${stats.total} checks`)
  ]
}

function formatDate(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`

  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function updateServices (services) {
  const container = document.getElementById('app')
  const openServices = new Set(
    Array.from(container.querySelectorAll('.service details[open]'))
      .map(details => details.dataset.serviceKey)
      .filter(Boolean)
  )

  container.removeAttribute('data-loading')
  container.innerHTML = '<ul></ul>'
  const ul = container.querySelector('ul')

  services.forEach(service => {
    const serviceElement = createServiceElement(service)
    const details = serviceElement.querySelector('details')
    const serviceKey = getServiceKey(service)

    details.dataset.serviceKey = serviceKey
    details.open = openServices.has(serviceKey)
    ul.appendChild(serviceElement)
  })
}

function getServiceKey (service) {
  return `${service.config.type}|${service.config.address}|${service.config.port || ''}`
}

function getServiceType (service) {
  if (service.config.type === 'url') return 'HTTP'

  const portMap = {
    53: 'DNS',
    80: 'HTTP',
    443: 'HTTPS',
    25: 'SMTP',
    587: 'SMTP',
    465: 'SMTPS',
    993: 'IMAPS',
    995: 'POP3S',
    143: 'IMAP',
    110: 'POP3'
  }

  return portMap[service.config.port] || `Port ${service.config.port}`
}

function updateFooter (timestamp) {
  const date = new Date(timestamp)
  document.getElementById('last-updated').textContent = date.toLocaleString()
}

// Load data on page load (skeleton already showing from HTML)
loadData()

// Auto-refresh every 60 seconds
setInterval(loadData, 60000)
