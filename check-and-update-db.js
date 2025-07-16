const fs = require('fs');
const https = require('https');
const http = require('http');
const net = require('net');
const { URL } = require('url');

// Port monitoring function
function checkHost(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve({
        duration: Date.now() - start,
        result: 'ConnectOK'
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        duration: timeout,
        result: 'ConnectFail'
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      console.error(`Host check failed for ${host}:${port} - ${err.message}`);
      resolve({
        duration: Date.now() - start,
        result: 'ConnectFail'
      });
    });

    socket.connect(port, host);
  });
}

// URL monitoring function
function checkUrl(url, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'HEAD',
      timeout: timeout,
      headers: {
        'User-Agent': 'Uptime Monitor/1.0'
      }
    };

    const req = protocol.request(options, (res) => {
      const duration = Date.now() - start;
      const result = (res.statusCode >= 200 && res.statusCode < 400) ? 'ConnectOK' : 'ConnectFail';

      resolve({
        duration,
        result,
        statusCode: res.statusCode
      });
    });

    req.on('error', (err) => {
      console.error(`URL check failed for ${url} - ${err.message}`);
      resolve({
        duration: Date.now() - start,
        result: 'ConnectFail'
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        duration: timeout,
        result: 'ConnectFail'
      });
    });

    req.end();
  });
}

// Migration function for old structure
function migrateServiceStructure(oldService) {
  const now = Math.floor(Date.now() / 1000);

  return {
    config: {
      address: oldService.address,
      type: oldService.type,
      port: oldService.port || null,
      timeout: oldService.timeout || 5,
      checkInterval: oldService.checkInterval || 300
    },
    status: {
      isUp: oldService.isUp || true,
      lastCheck: oldService.lastCheck || 0,
      lastResultDuration: oldService.lastResultDuration || 0
    },
    stats: {
      allTime: {
        total: oldService.totalChecks || oldService.checks?.total || 0,
        successful: oldService.successfulChecks || oldService.checks?.successful || 0
      },
      '30d': {
        total: oldService.checks?.total30d || 0,
        successful: oldService.checks?.successful30d || 0,
        uptime: oldService.uptime?.['30d'] || 100.0,
        lastReset: oldService.checks?.lastReset30d || now
      },
      '365d': {
        total: oldService.checks?.total365d || 0,
        successful: oldService.checks?.successful365d || 0,
        uptime: oldService.uptime?.['365d'] || 100.0,
        lastReset: oldService.checks?.lastReset365d || now
      }
    }
  };
}

// Load and validate services
function loadServices() {
  const dbPath = 'docs/db.json';

  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found');
    process.exit(1);
  }

  const jsonContent = fs.readFileSync(dbPath, 'utf8');
  let services;

  try {
    services = JSON.parse(jsonContent);
  } catch (err) {
    console.error('Database corrupted:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(services)) {
    console.error('Invalid database structure');
    process.exit(1);
  }

  // Migrate old structure to new if needed
  return services.map(service => {
    if (!service.config) {
      return migrateServiceStructure(service);
    }
    return service;
  });
}

// Save services data
function saveServices(services) {
  const dbPath = 'docs/db.json';

  try {
    fs.writeFileSync(dbPath, JSON.stringify(services, null, 2));
    console.log('Database updated successfully');
  } catch (err) {
    console.error('Failed to save database:', err.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  console.log('Starting uptime checks...');

  const services = loadServices();
  let checkExecuted = false;

  for (const service of services) {
    const config = service.config;
    const timeSinceLastCheck = Math.floor(Date.now() / 1000) - service.status.lastCheck;

    // Check if service needs to be checked
    const shouldCheck = (timeSinceLastCheck >= config.checkInterval) ||
                       (!service.status.isUp && timeSinceLastCheck >= 60);

    if (shouldCheck) {
      console.log(`Checking ${config.address}${config.port ? ':' + config.port : ''}...`);

      let result;
      if (config.type === 'url') {
        result = await checkUrl(config.address, config.timeout * 1000);
      } else {
        result = await checkHost(config.address, config.port, config.timeout * 1000);
      }

      // Update service status
      service.status.lastResultDuration = result.duration;
      service.status.lastCheck = Math.floor(Date.now() / 1000);
      service.status.isUp = (result.result === 'ConnectOK');

      // Reset counters if they're too old
      const currentTime = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = currentTime - (30 * 24 * 60 * 60);
      const threeSixtyFiveDaysAgo = currentTime - (365 * 24 * 60 * 60);

      // Reset 30d counters if last reset was more than 30 days ago
      if (service.stats['30d'].lastReset < thirtyDaysAgo) {
        service.stats['30d'].total = 0;
        service.stats['30d'].successful = 0;
        service.stats['30d'].lastReset = currentTime;
      }

      // Reset 365d counters if last reset was more than 365 days ago
      if (service.stats['365d'].lastReset < threeSixtyFiveDaysAgo) {
        service.stats['365d'].total = 0;
        service.stats['365d'].successful = 0;
        service.stats['365d'].lastReset = currentTime;
      }

      // Update all counters
      service.stats.allTime.total++;
      service.stats['30d'].total++;
      service.stats['365d'].total++;

      if (service.status.isUp) {
        service.stats.allTime.successful++;
        service.stats['30d'].successful++;
        service.stats['365d'].successful++;
      }

      // Calculate uptime percentages
      service.stats['30d'].uptime = service.stats['30d'].total > 0
        ? Math.round((service.stats['30d'].successful / service.stats['30d'].total) * 1000) / 10
        : 100.0;

      service.stats['365d'].uptime = service.stats['365d'].total > 0
        ? Math.round((service.stats['365d'].successful / service.stats['365d'].total) * 1000) / 10
        : 100.0;

      checkExecuted = true;

      const status = service.status.isUp ? 'UP' : 'DOWN';
      console.log(`${config.address}${config.port ? ':' + config.port : ''} - ${status} (${result.duration}ms)`);

      // Alert if service is down
      if (!service.status.isUp) {
        console.warn(`🚨 SERVICE DOWN: ${config.address}${config.port ? ':' + config.port : ''}`);
      }
    }
  }

  if (checkExecuted) {
    saveServices(services);
    console.log('Uptime checks completed and data saved');
  } else {
    console.log('No checks needed at this time');
  }
}

// Run the main function
main().catch(err => {
  console.error('Error during uptime check:', err);
  process.exit(1);
});
