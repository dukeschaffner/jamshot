'use client';
import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import styles from './ChartJSAnalyticsChart.module.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ChartJSAnalyticsChart = ({ 
  data = [], 
  metric = 'plays', 
  title = 'Analytics Chart',
  type = 'line', // 'line' or 'bar'
  height = 300,
  color = '#93E9BE',
  isDateBased = true,
  timeRange = null // { start_date, end_date, period }
}) => {
  const formatLabel = (labelString) => {
    // If it's not date-based data, return the label as-is
    if (!isDateBased) {
      return labelString;
    }
    
    // Handle date formatting for date-based data
    const date = new Date(labelString);
    if (isNaN(date.getTime())) {
      return labelString; // Return as-is if not a valid date
    }
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatValue = (value) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  };

  // Generate complete date range based on timeRange
  const generateDateRange = (startDate, endDate, period = 'day') => {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let current = new Date(start);
    
    while (current <= end) {
      dates.push(new Date(current).toISOString().split('T')[0]);
      
      // Increment based on period
      switch (period) {
        case 'day':
          current.setDate(current.getDate() + 1);
          break;
        case 'week':
          current.setDate(current.getDate() + 7);
          break;
        case 'month':
          current.setMonth(current.getMonth() + 1);
          break;
        case 'year':
          current.setFullYear(current.getFullYear() + 1);
          break;
        default:
          current.setDate(current.getDate() + 1);
      }
    }
    
    return dates;
  };

  const chartData = useMemo(() => {
    // Map UI metric names to database field names
    const metricFieldMap = {
      'plays': 'play_count',
      'listeners': 'listener_count',
      'likes': 'like_count',
      'comments': 'comment_count',
      'reposts': 'repost_count',
      'shares': 'share_count',
      'collaborations': 'collaboration_count'
    };
    
    const dbFieldName = metricFieldMap[metric] || metric;
    
    let processedData;
    
    if (isDateBased && timeRange && timeRange.start_date && timeRange.end_date) {
      // Generate complete date range
      const completeDateRange = generateDateRange(
        timeRange.start_date, 
        timeRange.end_date, 
        timeRange.period
      );
      
      // Create a map of existing data by date
      const dataMap = {};
      (data || []).forEach(item => {
        const dateKey = item.period_start?.split('T')[0] || item.period_start;
        dataMap[dateKey] = item[dbFieldName] || item[`${metric}_count`] || item[metric] || 0;
      });
      
      // Fill complete date range with data or zeros
      processedData = completeDateRange.map(date => ({
        date: date,
        value: dataMap[date] || 0,
        label: formatLabel(date)
      }));
    } else {
      // Fallback to original logic for non-date-based charts or when timeRange is not available
      if (!data || data.length === 0) return null;
      
      processedData = data.map(item => ({
        date: item.period_start,
        value: item[dbFieldName] || item[`${metric}_count`] || item[metric] || 0,
        label: formatLabel(item.period_start)
      }));

      // Sort by date in chronological order for date-based charts
      if (isDateBased) {
        processedData = processedData.sort((a, b) => new Date(a.date) - new Date(b.date));
      }
    }

    return {
      labels: processedData.map(item => item.label),
      datasets: [
        {
          label: metric.charAt(0).toUpperCase() + metric.slice(1),
          data: processedData.map(item => item.value),
          backgroundColor: type === 'bar' ? color : `${color}20`,
          borderColor: color,
          borderWidth: type === 'line' ? 3 : 1,
          fill: type === 'line',
          tension: type === 'line' ? 0.4 : 0,
          pointBackgroundColor: color,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: type === 'line' ? 4 : 0,
          pointHoverRadius: type === 'line' ? 6 : 0,
          borderRadius: type === 'bar' ? 4 : 0,
          borderSkipped: false,
          maxBarThickness: type === 'bar' ? 60 : undefined,
          barThickness: type === 'bar' ? 'flex' : undefined,
        }
      ]
    };
  }, [data, metric, color, type, isDateBased, timeRange]);

  const chartOptions = useMemo(() => {
    // Detect dark mode for grid colors
    const isDarkMode = typeof window !== 'undefined' && 
      document.body.classList.contains('dark-mode');
    
    const gridColor = isDarkMode 
      ? 'rgba(46, 46, 46, 0.4)' 
      : 'rgba(224, 224, 224, 0.3)';

    return ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: color,
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: function(context) {
            return `${formatValue(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: 'var(--text-secondary)',
          font: {
            size: 12
          },
          maxRotation: 0
        },
        border: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        suggestedMax: Math.max(5, Math.max(...(chartData?.datasets[0]?.data || [0])) + 1),
        grid: {
          color: gridColor,
          lineWidth: 1
        },
        ticks: {
          color: 'var(--text-secondary)',
          font: {
            size: 12
          },
          stepSize: 1,
          callback: function(value) {
            return formatValue(value);
          }
        },
        border: {
          display: false
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    },
    elements: {
      point: {
        hoverBorderWidth: 3
      }
    }
  });
  }, [color]);

  const totalValue = useMemo(() => {
    if (!chartData) return 0;
    return chartData.datasets[0].data.reduce((sum, value) => sum + value, 0);
  }, [chartData]);

  if (!chartData || chartData.labels.length === 0) {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{title}</h3>
        </div>
        <div className={styles.noData}>
          <div className={styles.noDataIcon}>📊</div>
          <p>No data available for the selected time period</p>
        </div>
      </div>
    );
  }

  const ChartComponent = type === 'bar' ? Bar : Line;

  return (
    <div className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{title}</h3>
        <div className={styles.chartSummary}>
          Total: {formatValue(totalValue)}
        </div>
      </div>
      
      <div className={styles.chartWrapper} style={{ height: `${height}px` }}>
        <ChartComponent data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default ChartJSAnalyticsChart;
