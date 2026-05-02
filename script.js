const MAX_POINTS = 30;
let isPowered = true;
let firstLoad = true;
let pollInterval = null;

// Load saved IP or fall back to default
let ARDUINO_IP = localStorage.getItem('arduino_ip') || 'http://10.182.164.160';

// Populate the input on load
window.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('ip-input');
  input.value = ARDUINO_IP;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveIP();
  });
});

function saveIP() {
  let val = document.getElementById('ip-input').value.trim();
  if (!val) return;
  if (!val.startsWith('http')) val = 'http://' + val;
  ARDUINO_IP = val;
  localStorage.setItem('arduino_ip', val);
  document.getElementById('ip-status').textContent = 'Saved';
  setTimeout(() => document.getElementById('ip-status').textContent = '', 2000);
  // Restart polling with new IP
  if (pollInterval) clearInterval(pollInterval);
  fetchData();
  pollInterval = setInterval(fetchData, 3000);
}

// Charts
const chartDefs = [
  { id: 'chart-temp',     color: '#fff' },
  { id: 'chart-humidity', color: '#fff' },
  { id: 'chart-pressure', color: '#fff' },
  { id: 'chart-altitude', color: '#fff' },
  { id: 'chart-ozone',    color: '#fff' },
  { id: 'chart-light',    color: '#fff' },
];

const charts = {};
const histories = {};

function makeChart(def) {
  const canvas = document.getElementById(def.id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  histories[def.id] = [];
  charts[def.id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: def.color,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1.5,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      }]
    },
    options: {
      animation: { duration: 300 },
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, grace: '10%' }
      }
    }
  });
}

function pushToChart(id, value) {
  const chart = charts[id];
  const hist = histories[id];
  if (!chart) return;
  hist.push(value);
  if (hist.length > MAX_POINTS) hist.shift();
  chart.data.labels = hist.map(() => '');
  chart.data.datasets[0].data = [...hist];
  chart.update('quiet');
}

chartDefs.forEach(makeChart);

function updateClock() {
  const now = new Date();
  document.getElementById('time-display').textContent =
    now.toLocaleTimeString('en-US', { hour12: false });
  document.getElementById('date-display').textContent =
    now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

async function setPower(on) {
  if (!on) zeroDisplay();
  isPowered = on;
  document.getElementById('power-status-text').textContent = on ? 'ON' : 'OFF';
  try {
    await fetch(`${ARDUINO_IP}/${on ? 'ON' : 'OFF'}`, { mode: 'no-cors' });
  } catch(e) {}
}

function parseHtml(html) {
  const patterns = {
    temp:     /Temperature[^\d]*(\d+\.?\d*)/i,
    humidity: /Humidity[^\d]*(\d+\.?\d*)/i,
    pressure: /Pressure[^\d]*(\d+\.?\d*)/i,
    altitude: /Altitude[^\d]*(\d+\.?\d*)/i,
    ozone:    /Ozone[^\d]*(\d+\.?\d*)/i,
    light:    /Light[^\d]*(\d+\.?\d*)/i,
    bme:      /BME680[^:]*:[^<]*?([\w\s]+?)(?:<|\/|$)/i,
  };
  const result = {};
  for (const [key, rx] of Object.entries(patterns)) {
    const m = html.match(rx);
    if (m) result[key] = key === 'bme' ? m[1] : parseFloat(m[1]);
  }
  return Object.keys(result).length > 2 ? result : null;
}

function updateDisplay(data) {
  const fields = [
    { key: 'temp',     el: 'val-temp',     chart: 'chart-temp',     dec: 2 },
    { key: 'humidity', el: 'val-humidity', chart: 'chart-humidity', dec: 2 },
    { key: 'pressure', el: 'val-pressure', chart: 'chart-pressure', dec: 2 },
    { key: 'altitude', el: 'val-altitude', chart: 'chart-altitude', dec: 2 },
    { key: 'ozone',    el: 'val-ozone',    chart: 'chart-ozone',    dec: 2 },
    { key: 'light',    el: 'val-light',    chart: 'chart-light',    dec: 2 },
  ];

  fields.forEach(f => {
    if (data[f.key] !== undefined) {
      document.getElementById(f.el).textContent = data[f.key].toFixed(f.dec);
      pushToChart(f.chart, data[f.key]);
    }
  });

  const bmeText = data.bme || (data.bmeDetected ? 'Detected' : 'Not detected');
  const detected = bmeText && !bmeText.toLowerCase().includes('not');
  document.getElementById('bme-status-text').textContent = `BME680: ${bmeText}`;
  const dot = document.getElementById('bme-dot');
  detected ? dot.classList.add('detected') : dot.classList.remove('detected');

  document.getElementById('last-update').textContent =
    'Last update: ' + new Date().toLocaleTimeString('en-US', { hour12: false });
}

async function fetchData() {
  if (!isPowered) return;
  try {
    const res = await fetch(`${ARDUINO_IP}/data`, { mode: 'cors', signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    document.getElementById('error-bar').style.display = 'none';
    updateDisplay(data);
  } catch(e) {
    try {
      const res = await fetch(`${ARDUINO_IP}/`, { mode: 'cors', signal: AbortSignal.timeout(4000) });
      const html = await res.text();
      const parsed = parseHtml(html);
      if (parsed) {
        document.getElementById('error-bar').style.display = 'none';
        updateDisplay(parsed);
      } else {
        document.getElementById('error-bar').style.display = 'block';
      }
    } catch(e2) {
      document.getElementById('error-bar').style.display = 'block';
    }
  }

  if (firstLoad) firstLoad = false;
}

fetchData();
pollInterval = setInterval(fetchData, 3000);

function zeroDisplay() {
  const fields = ['val-temp', 'val-humidity', 'val-pressure', 'val-altitude', 'val-ozone', 'val-light'];
  const chartIds = ['chart-temp', 'chart-humidity', 'chart-pressure', 'chart-altitude', 'chart-ozone', 'chart-light'];
  fields.forEach(id => document.getElementById(id).textContent = '0.00');
  chartIds.forEach(id => pushToChart(id, 0));
}
