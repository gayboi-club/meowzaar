window.MeowCharts = (() => {
  let chart = null;

  const fmtTime = (t) => {
    const d = new Date(t);
    const span = (Date.now() - t);
    if (span < 6 * 60 * 60 * 1000) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (span < 48 * 60 * 60 * 1000) {
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const fmtP = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return '-';
    return n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString();
  };

  function render(canvas, data, opts = {}) {
    const { points } = data;
    const labels = points.map((p) => fmtTime(p.t));
    const buys = points.map((p) => p.buy);
    const sells = points.map((p) => p.sell);
    const vols = points.map((p, i) => Math.abs(buys[i] - sells[i]));

    if (chart) chart.destroy();

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'buy',
            data: buys,
            borderColor: '#7ea3cc',
            backgroundColor: 'rgba(126, 163, 204, 0.14)',
            fill: true,
            tension: 0.25,
            borderWidth: 1.6,
            pointRadius: 0,
            pointHoverRadius: 3,
            yAxisID: 'y'
          },
          {
            label: 'sell',
            data: sells,
            borderColor: '#255c99',
            backgroundColor: 'rgba(37, 92, 153, 0.14)',
            fill: true,
            tension: 0.25,
            borderWidth: 1.6,
            pointRadius: 0,
            pointHoverRadius: 3,
            yAxisID: 'y'
          },
          {
            label: 'spread',
            data: vols,
            type: 'bar',
            backgroundColor: 'rgba(37, 92, 153, 0.30)',
            borderColor: 'rgba(37, 92, 153, 0.55)',
            borderWidth: 1,
            order: -1,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9aa7b8', boxWidth: 10, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(45, 45, 45, 0.96)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            titleColor: '#e9edf3',
            bodyColor: '#e9edf3',
            displayColors: true,
            callbacks: {
              label: (c) => `${c.dataset.label}: ${fmtP(c.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#5c6577',
              maxTicksLimit: 8,
              maxRotation: 0,
              font: { size: 10 }
            },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            position: 'right',
            ticks: {
              color: '#5c6577',
              font: { size: 10 },
              callback: fmtP
            },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y1: {
            position: 'left',
            beginAtZero: true,
            display: opts.showVolume !== false,
            ticks: {
              color: '#5c6577',
              font: { size: 9 },
              maxTicksLimit: 4,
              callback: fmtP
            },
            grid: { display: false }
          }
        }
      }
    });

    return chart;
  }

  function destroy() {
    if (chart) { chart.destroy(); chart = null; }
  }

  return { render, destroy, fmtP };
})();