import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, ArcElement, Filler
);

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: 'rgba(241,245,249,0.75)', font: { family: 'Outfit', size: 12 } }
    },
    tooltip: {
      backgroundColor: 'rgba(26,5,51,0.95)',
      titleColor: '#f5a623',
      bodyColor: '#f1f5f9',
      borderColor: 'rgba(168,85,247,0.3)',
      borderWidth: 1,
    }
  },
  scales: {
    x: {
      ticks: { color: 'rgba(241,245,249,0.5)', font: { family: 'Outfit', size: 11 } },
      grid: { color: 'rgba(255,255,255,0.05)' }
    },
    y: {
      ticks: { color: 'rgba(241,245,249,0.5)', font: { family: 'Outfit', size: 11 } },
      grid: { color: 'rgba(255,255,255,0.06)' }
    }
  }
};

// ---------- Bar Chart (Monthly Comparison) ----------
export function MonthCompareChart({ thisMonthData, lastMonthData, labels }) {
  const data = {
    labels: labels || [],
    datasets: [
      {
        label: 'इस महीने',
        data: thisMonthData || [],
        backgroundColor: 'rgba(245,166,35,0.7)',
        borderColor: 'rgba(245,166,35,1)',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'पिछले महीने',
        data: lastMonthData || [],
        backgroundColor: 'rgba(168,85,247,0.5)',
        borderColor: 'rgba(168,85,247,1)',
        borderWidth: 1,
        borderRadius: 4,
      }
    ]
  };
  return (
    <div className="chart-container">
      <Bar data={data} options={chartDefaults} />
    </div>
  );
}

// ---------- Line Chart (Daily Trend) ----------
export function DailyTrendChart({ data: rawData, labels, color = '#f5a623' }) {
  const data = {
    labels: labels || [],
    datasets: [{
      label: 'मात्रा',
      data: rawData || [],
      borderColor: color,
      backgroundColor: `${color}22`,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: color,
      pointRadius: 3,
    }]
  };
  return (
    <div className="chart-container">
      <Line data={data} options={chartDefaults} />
    </div>
  );
}

// ---------- Doughnut Chart (Category Breakdown) ----------
export function CategoryChart({ labels, values }) {
  const COLORS = ['#f5a623','#a855f7','#06b6d4','#22c55e','#f97316','#ef4444','#eab308'];
  const data = {
    labels: labels || [],
    datasets: [{
      data: values || [],
      backgroundColor: COLORS.map(c => `${c}cc`),
      borderColor: COLORS,
      borderWidth: 2,
    }]
  };
  return (
    <div className="chart-container">
      <Doughnut data={data} options={{ ...chartDefaults, scales: undefined }} />
    </div>
  );
}
