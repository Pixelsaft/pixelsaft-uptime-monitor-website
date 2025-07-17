async function loadData () {
  try {
    const response = await fetch('./db.json')
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
    element.querySelector('.uptime-main').textContent = `${service.stats['365d'].uptime.toFixed(1)}% (365d)`
    element.querySelector('.uptime-main').setAttribute('value', service.stats['365d'].uptime)
    element.querySelector('.uptime-detail').textContent = `${service.stats['30d'].uptime.toFixed(1)}% (30d)`
    element.querySelector('.uptime-detail').setAttribute('value', service.stats['30d'].uptime)
  }

  return element
}

function updateServices (services) {
  const container = document.getElementById('app')
  container.removeAttribute('data-loading')
  container.innerHTML = '<ul></ul>'
  const ul = container.querySelector('ul')

  services.forEach(service => {
    ul.appendChild(createServiceElement(service))
  })
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
