const fs = require('fs');
const https = require('https');
const http = require('http');
const net = require('net');
const { URL } = require('url');

const STATUS_PATH = process.env.STATUS_PATH || 'docs/status.json';
const HISTORY_PATH = process.env.HISTORY_PATH || 'history.json';
const CHECK_INTERVAL_SECONDS = Number(process.env.CHECK_INTERVAL_SECONDS || 15 * 60);
const CHECK_ATTEMPTS = Number(process.env.CHECK_ATTEMPTS || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 1000);
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkService(config) {
  let lastResult;

  for (let attempt = 1; attempt <= CHECK_ATTEMPTS; attempt++) {
    lastResult = config.type === 'url'
      ? await checkUrl(config.address, config.timeout * 1000)
      : await checkHost(config.address, config.port, config.timeout * 1000);

    if (lastResult.result === 'ConnectOK' || attempt === CHECK_ATTEMPTS) {
      return lastResult;
    }

    console.warn(`Retrying ${config.address}${config.port ? ':' + config.port : ''} (${attempt}/${CHECK_ATTEMPTS})...`);
    await wait(RETRY_DELAY_MS);
  }

  return lastResult;
}

function calculateUptime(successful, total) {
  return total > 0 ? Math.round((successful / total) * 100000) / 1000 : 100.0;
}

function calculateCoverage(recorded, expected) {
  return expected > 0 ? Math.round((recorded / expected) * 100000) / 1000 : 100.0;
}

function expectedChecksBetween(startTime, currentTime) {
  if (!startTime || startTime > currentTime) return 0;

  return Math.max(1, Math.floor((currentTime - startTime) / CHECK_INTERVAL_SECONDS));
}

function getServiceKey(service) {
  const config = service.config || service;

  return `${config.type}|${config.address}|${config.port || ''}`;
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
  for (const bucket of history) {
    if (bucket.lastCheck < windowStart) continue;

    const checks = getBucketChecks(bucket);

    if (!checks) {
      total += bucket.total;
      successful += bucket.successful;
      continue;
    }

    for (const [timestamp, success] of checks) {
      if (timestamp < windowStart) continue;

      total++;
      if (success) successful++;
    }
  }

  return {
    total,
    successful,
    uptime: calculateUptime(successful, total),
    since: windowStart
  };
}

function calculateAllTimeStats(allTime, currentTime) {
  const since = allTime.since || currentTime;
  const expected = expectedChecksBetween(since, currentTime);

  return {
    total: allTime.total,
    successful: allTime.successful,
    uptime: calculateUptime(allTime.successful, allTime.total),
    since,
    expected,
    coverage: calculateCoverage(allTime.total, expected)
  };
}

function addHistoryEntry(historyService, timestamp, isUp) {
  const date = getDateKey(timestamp);
  let bucket = historyService.history.find(entry => entry.date === date);

  if (!bucket) {
    bucket = {
      date,
      total: 0,
      successful: 0,
      firstCheck: timestamp,
      lastCheck: timestamp,
      checks: ''
    };
    historyService.history.push(bucket);
  }

  bucket.total++;
  if (isUp) {
    bucket.successful++;
  }
  bucket.firstCheck = Math.min(bucket.firstCheck, timestamp);
  bucket.lastCheck = Math.max(bucket.lastCheck, timestamp);
  appendEncodedCheck(bucket, timestamp, isUp);

  historyService.allTime.since = historyService.allTime.since || timestamp;
  historyService.allTime.total++;
  if (isUp) {
    historyService.allTime.successful++;
  }
}

function sortHistory(historyService, currentTime) {
  historyService.history = (historyService.history || [])
    .filter(bucket => bucket.lastCheck >= currentTime - THREE_SIXTY_FIVE_DAYS_SECONDS)
    .sort((a, b) => a.firstCheck - b.firstCheck);
}

function updateStats(service, historyService, currentTime) {
  sortHistory(historyService, currentTime);
  service.stats.allTime = calculateAllTimeStats(historyService.allTime, currentTime);
  service.stats['30d'] = calculateWindowStats(historyService.history, currentTime, THIRTY_DAYS_SECONDS);
  service.stats['365d'] = calculateWindowStats(
    historyService.history,
    currentTime,
    Math.min(THREE_SIXTY_FIVE_DAYS_SECONDS, currentTime - service.stats.allTime.since)
  );
}

function createDefaultStats() {
  return {
    allTime: {
      total: 0,
      successful: 0,
      uptime: 100.0,
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
  };
}

function normalizeStatusService(service) {
  return {
    config: service.config,
    status: service.status || { isUp: true, lastCheck: 0, lastResultDuration: 0 },
    stats: service.stats || createDefaultStats()
  };
}

function normalizeHistoryService(historyService, statusService) {
  const allTime = historyService?.allTime || statusService.stats.allTime || {};

  return {
    config: statusService.config,
    allTime: {
      total: allTime.total || 0,
      successful: allTime.successful || 0,
      since: allTime.since || statusService.status.lastCheck || 0
    },
    history: Array.isArray(historyService?.history) ? historyService.history : []
  };
}

function readJsonFile(path, required = true) {
  if (!fs.existsSync(path)) {
    if (required) {
      console.error(`${path} not found`);
      process.exit(1);
    }

    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`${path} corrupted:`, err.message);
    process.exit(1);
  }
}

function loadStatusServices() {
  const status = readJsonFile(STATUS_PATH);

  if (!Array.isArray(status)) {
    console.error('Invalid status database structure');
    process.exit(1);
  }

  return status.map(normalizeStatusService);
}

function loadHistoryServices(statusServices) {
  const history = readJsonFile(HISTORY_PATH);

  if (!Array.isArray(history)) {
    console.error('Invalid history database structure');
    process.exit(1);
  }

  const historyByKey = new Map(history.map(service => [getServiceKey(service), service]));

  return statusServices.map(statusService => {
    const historyService = historyByKey.get(getServiceKey(statusService));

    if (!historyService) {
      console.error(`History missing for ${getServiceKey(statusService)}`);
      process.exit(1);
    }

    return normalizeHistoryService(historyService, statusService);
  });
}

function saveJsonFile(path, data) {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save ${path}:`, err.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  console.log('Starting uptime checks...');

  const services = loadStatusServices();
  const historyServices = loadHistoryServices(services);
  const historyByKey = new Map(historyServices.map(service => [getServiceKey(service), service]));

  for (const service of services) {
    const config = service.config;
    const historyService = historyByKey.get(getServiceKey(service));

    console.log(`Checking ${config.address}${config.port ? ':' + config.port : ''}...`);

    const result = await checkService(config);
    const currentTime = Math.floor(Date.now() / 1000);
    const isUp = result.result === 'ConnectOK';

    service.status.lastResultDuration = result.duration;
    service.status.lastCheck = currentTime;
    service.status.isUp = isUp;

    addHistoryEntry(historyService, currentTime, isUp);
    updateStats(service, historyService, currentTime);

    const status = service.status.isUp ? 'UP' : 'DOWN';
    console.log(`${config.address}${config.port ? ':' + config.port : ''} - ${status} (${result.duration}ms)`);

    if (!service.status.isUp) {
      console.warn(`🚨 SERVICE DOWN: ${config.address}${config.port ? ':' + config.port : ''}`);
    }
  }

  saveJsonFile(STATUS_PATH, services);
  saveJsonFile(HISTORY_PATH, historyServices);
  console.log('Uptime checks completed and data saved');
}

main().catch(err => {
  console.error('Error during uptime check:', err);
  process.exit(1);
});
