const fs = require('fs');
const https = require('https');
const http = require('http');
const net = require('net');
const { URL } = require('url');

const DB_PATH = process.env.DB_PATH || 'docs/db.json';
const CHECK_INTERVAL_SECONDS = Number(process.env.CHECK_INTERVAL_SECONDS || 15 * 60);
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const THREE_SIXTY_FIVE_DAYS_SECONDS = 365 * 24 * 60 * 60;

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

function calculateUptime(successful, total) {
  return total > 0 ? Math.round((successful / total) * 10000) / 100 : 100.0;
}

function calculateCoverage(recorded, expected) {
  return expected > 0 ? Math.round((recorded / expected) * 10000) / 100 : 100.0;
}

function expectedChecksBetween(startTime, currentTime) {
  if (!startTime || startTime > currentTime) return 0;

  return Math.floor((currentTime - startTime) / CHECK_INTERVAL_SECONDS) + 1;
}

function getDateKey(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function getDayStart(date) {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 1000);
}

function encodeCheck(date, timestamp, isUp) {
  return `${(timestamp - getDayStart(date)).toString(36)}${isUp ? 'u' : 'd'}`;
}

function appendEncodedCheck(bucket, timestamp, isUp) {
  const encodedCheck = encodeCheck(bucket.date, timestamp, isUp);
  bucket.checks = bucket.checks ? `${bucket.checks},${encodedCheck}` : encodedCheck;
}

function getBucketChecks(bucket) {
  if (typeof bucket.checks === 'string') {
    return bucket.checks.split(',').filter(Boolean).map(check => {
      const success = check.endsWith('u');
      const offset = parseInt(check.slice(0, -1), 36);

      return [getDayStart(bucket.date) + offset, success];
    });
  }

  if (Array.isArray(bucket.checks)) {
    return bucket.checks.map(([timestamp, success]) => [timestamp, !!success]);
  }

  return null;
}

function calculateWindowStats(history, currentTime, windowSeconds) {
  const windowStart = currentTime - windowSeconds;
  let total = 0;
  let successful = 0;
  let firstRecordedCheck = currentTime;

  for (const bucket of history) {
    if (bucket.lastCheck < windowStart) continue;

    const checks = getBucketChecks(bucket);

    if (!checks) {
      total += bucket.total;
      successful += bucket.successful;
      firstRecordedCheck = Math.min(firstRecordedCheck, bucket.firstCheck);
      continue;
    }

    for (const [timestamp, success] of checks) {
      if (timestamp < windowStart) continue;

      total++;
      if (success) successful++;
      firstRecordedCheck = Math.min(firstRecordedCheck, timestamp);
    }
  }

  const expected = expectedChecksBetween(Math.max(windowStart, firstRecordedCheck), currentTime);

  return {
    total,
    successful,
    uptime: calculateUptime(successful, total),
    expected,
    coverage: calculateCoverage(total, expected),
    since: firstRecordedCheck
  };
}

function addHistoryEntry(service, timestamp, isUp) {
  const date = getDateKey(timestamp);
  let bucket = service.history.find(entry => entry.date === date);

  if (!bucket) {
    bucket = {
      date,
      total: 0,
      successful: 0,
      firstCheck: timestamp,
      lastCheck: timestamp,
      checks: ''
    };
    service.history.push(bucket);
  }

  bucket.total++;
  if (isUp) {
    bucket.successful++;
  }
  bucket.firstCheck = Math.min(bucket.firstCheck, timestamp);
  bucket.lastCheck = Math.max(bucket.lastCheck, timestamp);
  appendEncodedCheck(bucket, timestamp, isUp);
}

function updateRollingStats(service, currentTime) {
  service.history = (service.history || [])
    .filter(bucket => bucket.lastCheck >= currentTime - THREE_SIXTY_FIVE_DAYS_SECONDS)
    .sort((a, b) => a.firstCheck - b.firstCheck);

  service.stats.allTime.since = service.stats.allTime.since || service.history[0]?.firstCheck || currentTime;
  service.stats.allTime.expected = expectedChecksBetween(service.stats.allTime.since, currentTime);
  service.stats.allTime.coverage = calculateCoverage(service.stats.allTime.total, service.stats.allTime.expected);
  service.stats['30d'] = calculateWindowStats(service.history, currentTime, THIRTY_DAYS_SECONDS);
  service.stats['365d'] = calculateWindowStats(service.history, currentTime, THREE_SIXTY_FIVE_DAYS_SECONDS);
}

function migrateChecksToHistory(checks) {
  const history = [];

  for (const check of checks) {
    const timestamp = check.timestamp;
    const date = getDateKey(timestamp);
    let bucket = history.find(entry => entry.date === date);

    if (!bucket) {
      bucket = {
        date,
        total: 0,
        successful: 0,
        firstCheck: timestamp,
        lastCheck: timestamp,
        checks: ''
      };
      history.push(bucket);
    }

    bucket.total++;
    if (check.success) {
      bucket.successful++;
    }
    bucket.firstCheck = Math.min(bucket.firstCheck, timestamp);
    bucket.lastCheck = Math.max(bucket.lastCheck, timestamp);
    appendEncodedCheck(bucket, timestamp, check.success);
  }

  return history;
}

// Migration function for old structure
function migrateServiceStructure(oldService) {
  const total = oldService.totalChecks || oldService.checks?.total || 0;
  const successful = oldService.successfulChecks || oldService.checks?.successful || 0;

  return {
    config: {
      address: oldService.address,
      type: oldService.type,
      port: oldService.port || null,
      timeout: oldService.timeout || 5
    },
    status: {
      isUp: oldService.isUp ?? true,
      lastCheck: oldService.lastCheck || 0,
      lastResultDuration: oldService.lastResultDuration || 0
    },
    stats: {
      allTime: {
        total,
        successful,
        uptime: calculateUptime(successful, total),
        expected: 0,
        coverage: 100.0,
        since: 0
      },
      '30d': {
        total: 0,
        successful: 0,
        uptime: 100.0,
        expected: 0,
        coverage: 100.0,
        since: 0
      },
      '365d': {
        total: 0,
        successful: 0,
        uptime: 100.0,
        expected: 0,
        coverage: 100.0,
        since: 0
      }
    },
    history: []
  };
}

function normalizeService(service) {
  if (!service.config) {
    return migrateServiceStructure(service);
  }

  service.status = service.status || { isUp: true, lastCheck: 0, lastResultDuration: 0 };
  service.stats = service.stats || {};
  service.stats.allTime = service.stats.allTime || { total: 0, successful: 0 };
  service.stats.allTime.uptime = calculateUptime(service.stats.allTime.successful, service.stats.allTime.total);
  service.stats.allTime.since = service.stats.allTime.since || service.history?.[0]?.firstCheck || service.status.lastCheck || 0;
  service.stats.allTime.expected = service.stats.allTime.expected || 0;
  service.stats.allTime.coverage = service.stats.allTime.coverage || 100.0;

  service.history = Array.isArray(service.history) ? service.history : migrateChecksToHistory(service.checks || []);
  delete service.checks;
  delete service.legacyStats;

  return service;
}

// Load and validate services
function loadServices() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Database file not found');
    process.exit(1);
  }

  const jsonContent = fs.readFileSync(DB_PATH, 'utf8');
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

  return services.map(normalizeService);
}

// Save services data
function saveServices(services) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(services, null, 2));
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

  for (const service of services) {
    const config = service.config;

    console.log(`Checking ${config.address}${config.port ? ':' + config.port : ''}...`);

    let result;
    if (config.type === 'url') {
      result = await checkUrl(config.address, config.timeout * 1000);
    } else {
      result = await checkHost(config.address, config.port, config.timeout * 1000);
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const isUp = result.result === 'ConnectOK';

    // Update service status
    service.status.lastResultDuration = result.duration;
    service.status.lastCheck = currentTime;
    service.status.isUp = isUp;

    // Keep all-time as an aggregate, and use compact daily history for rolling windows.
    service.stats.allTime.total++;
    if (isUp) {
      service.stats.allTime.successful++;
    }
    service.stats.allTime.uptime = calculateUptime(
      service.stats.allTime.successful,
      service.stats.allTime.total
    );
    service.stats.allTime.since = service.stats.allTime.since || currentTime;

    addHistoryEntry(service, currentTime, isUp);
    updateRollingStats(service, currentTime);

    const status = service.status.isUp ? 'UP' : 'DOWN';
    console.log(`${config.address}${config.port ? ':' + config.port : ''} - ${status} (${result.duration}ms)`);

    // Alert if service is down
    if (!service.status.isUp) {
      console.warn(`🚨 SERVICE DOWN: ${config.address}${config.port ? ':' + config.port : ''}`);
    }
  }

  saveServices(services);
  console.log('Uptime checks completed and data saved');
}

// Run the main function
main().catch(err => {
  console.error('Error during uptime check:', err);
  process.exit(1);
});
