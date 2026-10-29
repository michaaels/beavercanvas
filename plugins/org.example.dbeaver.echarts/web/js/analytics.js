(() => {
  'use strict';

  const CARTESIAN_TYPES = new Set(['line', 'area', 'bar', 'scatter', 'horizontalBar', 'stackedBar', 'stackedArea']);
  const CHART_TYPES = Object.freeze([
    { id: 'line', label: 'Line', group: 'Trends', hint: 'Compare numeric series over a date or category.' },
    { id: 'area', label: 'Area', group: 'Trends', hint: 'Show the magnitude of numeric series over time.' },
    { id: 'stackedArea', label: 'Stacked area', group: 'Trends', hint: 'Compare parts of a total over time. Use series with the same units; all series share one axis.', singleAxis: true },
    { id: 'bar', label: 'Bar', group: 'Comparison', hint: 'Compare categories side by side. Repeated categories are summed.' },
    { id: 'horizontalBar', label: 'Horizontal bar', group: 'Comparison', hint: 'Compare categories with long names. Category labels appear on the vertical axis.' },
    { id: 'stackedBar', label: 'Stacked bar', group: 'Comparison', hint: 'Compare parts of a total by category. Use series with the same units; all series share one axis.', singleAxis: true },
    { id: 'radar', label: 'Radar', group: 'Comparison', hint: 'Compare categories across several numeric measures.' },
      { id: 'pie', label: 'Pie / ring', group: 'Composition', singleValue: true, hint: 'Choose one numeric value to compare category proportions. A pie has no left or right axes.' },
    { id: 'treemap', label: 'Treemap', group: 'Composition', hint: 'Show category proportions as rectangles using the first selected series.' },
    { id: 'funnel', label: 'Funnel', group: 'Composition', hint: 'Compare stages using the first selected numeric series.' },
    { id: 'scatter', label: 'Scatter', group: 'Distribution', hint: 'Compare numeric X and Y values to find relationships.' },
    { id: 'boxplot', label: 'Boxplot', group: 'Distribution', hint: 'Summarize the distribution of each selected numeric series.' },
    { id: 'heatmap', label: 'Heatmap', group: 'Distribution', hint: 'Compare numeric measures by category using a color scale.' },
    { id: 'gauge', label: 'Gauge', group: 'Indicators and maps', hint: 'Show the average of the first selected numeric series.' },
    { id: 'map', label: 'Map', group: 'Indicators and maps', hint: 'Choose a location format, then add the fields to show at each point. Coordinates use WGS84 degrees.' }
  ].map(type => Object.freeze(type)));
  function populateTypes(select) {
    select.replaceChildren();
    let group;
    for (const type of CHART_TYPES) {
      if (group?.label !== type.group) { group = document.createElement('optgroup'); group.label = type.group; select.append(group); }
      const option = document.createElement('option'); option.value = type.id; option.textContent = type.label; group.append(option);
    }
  }
  const toNumber = value => {
    if (value === null || value === undefined || value === '') return NaN;
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : NaN;
  };
  const displayValue = value => value === null || value === undefined ? '(null)' : String(value);
  const numericValues = (rows, index) => rows.map(row => toNumber(row[index])).filter(Number.isFinite);

  function extent(values, fallbackMinimum = 0, fallbackMaximum = 1) {
    if (!values.length) return [fallbackMinimum, fallbackMaximum];
    let minimum = values[0];
    let maximum = values[0];
    for (let index = 1; index < values.length; index++) {
      minimum = Math.min(minimum, values[index]);
      maximum = Math.max(maximum, values[index]);
    }
    if (minimum === maximum) {
      const padding = Math.abs(minimum || 1) * 0.1;
      return [minimum - padding, maximum + padding];
    }
    return [minimum, maximum];
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
  }

  function quantile(sortedValues, percentile) {
    if (!sortedValues.length) return NaN;
    const position = (sortedValues.length - 1) * percentile;
    const lower = Math.floor(position);
    const fraction = position - lower;
    return sortedValues[lower + 1] === undefined
      ? sortedValues[lower]
      : sortedValues[lower] + fraction * (sortedValues[lower + 1] - sortedValues[lower]);
  }

  function boxplot(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return [sorted[0], quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75), sorted.at(-1)];
  }

  function aggregateByCategory(rows, xIndex, yIndex) {
    const totals = new Map();
    for (const row of rows) {
      const value = toNumber(row[yIndex]);
      if (!Number.isFinite(value)) continue;
      const name = displayValue(row[xIndex]);
      totals.set(name, (totals.get(name) || 0) + value);
    }
    return [...totals.entries()].map(([name, value]) => ({ name, value }));
  }

  const GROUP_AGGREGATES = ['none', 'sum', 'average', 'count', 'min', 'max'];
  const canGroup = type => CARTESIAN_TYPES.has(type) || ['pie', 'treemap', 'funnel', 'radar', 'heatmap'].includes(type);
  function normalizeGrouping(value) {
    const seriesColumn = typeof value?.seriesColumn === 'string' ? value.seriesColumn.slice(0, 200) : '';
    return { aggregate: GROUP_AGGREGATES.includes(value?.aggregate) ? value.aggregate : seriesColumn ? 'sum' : 'none',
      seriesColumn, mode: value?.mode === 'category' ? 'category' : 'series' };
  }
  function groupedContext(context) {
    const grouping = normalizeGrouping(context.grouping);
    if (!canGroup(context.chartType) || grouping.aggregate === 'none' && !grouping.seriesColumn) return context;
    const { columns, xIndex, yIndices } = context;
    const second = grouping.seriesColumn ? columns.findIndex(column => column.name === grouping.seriesColumn) : -1;
    if (grouping.seriesColumn && (second < 0 || second === xIndex)) throw new Error('Choose a different, available field for the second category.');
    const split = second >= 0 && grouping.mode === 'series';
    if (split && !CARTESIAN_TYPES.has(context.chartType)) throw new Error('Use combined categories for this chart, or choose a line/bar chart for separate series.');
    const series = new Map(), groups = new Map(), categories = new Map();
    const method = grouping.aggregate === 'none' ? 'sum' : grouping.aggregate;
    for (const row of context.rows) {
      const rawX = row[xIndex], rawSecond = second >= 0 ? row[second] : null;
      const categoryKey = JSON.stringify(second >= 0 && !split ? [rawX, rawSecond] : [rawX]);
      const seriesKey = JSON.stringify(split ? [rawSecond] : []);
      if (!series.has(seriesKey)) {
        if ((series.size + 1) * yIndices.length > 48) throw new Error('Grouping produces more than 48 series. Filter the data or select fewer measures.');
        series.set(seriesKey, rawSecond);
      }
      if (!categories.has(categoryKey)) categories.set(categoryKey, second >= 0 && !split ? `${displayValue(rawX)} · ${displayValue(rawSecond)}` : rawX);
      const key = JSON.stringify([categoryKey, seriesKey]);
      if (!groups.has(key)) groups.set(key, yIndices.map(() => ({ count: 0, sum: 0, min: Infinity, max: -Infinity, rows: 0 })));
      groups.get(key).forEach((acc, index) => {
        acc.rows++; const value = toNumber(row[yIndices[index]]); if (!Number.isFinite(value)) return;
        acc.count++; acc.sum += value; acc.min = Math.min(acc.min, value); acc.max = Math.max(acc.max, value);
      });
    }
    const resultColumns = [{ ...columns[xIndex], ...(second >= 0 && !split ? { kind: 'STRING', name: `${columns[xIndex].name} · ${columns[second].name}` } : {}) }], axes = {};
    for (const [, label] of series) for (const index of yIndices) {
      axes[resultColumns.length] = context.yAxes?.[index] || 'left';
      resultColumns.push({ name: split ? `${columns[index].name} / ${displayValue(label)}` : columns[index].name, kind: 'NUMERIC', axisName: columns[index].name });
    }
    const rows = [...categories].map(([key, label]) => {
      const values = [label];
      for (const seriesKey of series.keys()) for (const acc of groups.get(JSON.stringify([key, seriesKey])) || yIndices.map(() => null)) {
        values.push(!acc ? null : method === 'count' ? acc.rows : !acc.count ? null : method === 'average' ? acc.sum / acc.count : acc[method]);
      }
      return values;
    });
    return { ...context, rows, columns: resultColumns, xIndex: 0, yIndices: resultColumns.slice(1).map((_, index) => index + 1), yAxes: axes };
  }

  function toolbox(theme, zoom = false) {
    const feature = { restore: {}, saveAsImage: {} };
    if (zoom) feature.dataZoom = { yAxisIndex: 'none' };
    return {
      right: 12,
      iconStyle: { borderColor: theme.muted },
      emphasis: { iconStyle: { borderColor: theme.foreground } },
      feature
    };
  }

  function titleText(columns, xIndex, yIndices) {
    const names = yIndices.map(index => columns[index]?.name).filter(Boolean);
    return `${names.length > 2 ? `${names.length} series` : names.join(', ')} by ${columns[xIndex]?.name || 'category'}`;
  }

  function baseOption(context, zoom = false) {
    const { columns, xIndex, yIndices, theme } = context;
    return {
      animation: context.rowCount <= 2000,
      backgroundColor: theme.background,
      color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'],
      textStyle: { color: theme.foreground },
      title: {
        show: !context.dashboard,
        text: titleText(columns, xIndex, yIndices),
        left: 12,
        top: 8,
        textStyle: { fontSize: 14, fontWeight: 600, color: theme.foreground }
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: theme.controlBackground,
        borderColor: theme.border,
        textStyle: { color: theme.foreground }
      },
      legend: { type: 'scroll', top: context.dashboard ? 8 : 34, left: 12, right: 130, textStyle: { color: theme.foreground } },
      toolbox: toolbox(theme, zoom)
    };
  }

  function axisStyle(theme, includeGrid = false) {
    const axis = {
      axisLine: { lineStyle: { color: theme.muted } },
      axisLabel: { color: theme.muted, hideOverlap: true },
      nameTextStyle: { color: theme.muted }
    };
    if (includeGrid) axis.splitLine = { lineStyle: { color: theme.grid } };
    return axis;
  }

  function dataZoom() {
    return [
      {
        type: 'inside',
        xAxisIndex: [0],
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
        preventDefaultMouseMove: true
      },
      { type: 'slider', xAxisIndex: [0], height: 18, bottom: 8, filterMode: 'none', realtime: true }
    ];
  }

  function seriesMarks(enabled) {
    const marks = {};
    if (enabled.markLine) marks.markLine = { silent: true, data: [{ type: 'average', name: 'Mean' }] };
    if (enabled.markArea) {
      marks.markArea = { silent: true, data: [[{ type: 'min', name: 'Min' }, { type: 'max', name: 'Max' }]] };
    }
    return marks;
  }

  function buildCartesian(context) {
    const { rows, columns, xIndex, yIndices, yAxes, chartType, theme, marks } = context;
    const xColumn = columns[xIndex];
    const horizontal = chartType === 'horizontalBar', stacked = chartType === 'stackedBar' || chartType === 'stackedArea';
    const bars = ['bar', 'horizontalBar', 'stackedBar'].includes(chartType);
    const useTimeAxis = xColumn.kind === 'DATETIME' && !bars;
    const useCategoryAxis = xColumn.kind === 'STRING' || bars;
    const categories = [...new Set(rows.filter(row => yIndices.some(index => Number.isFinite(toNumber(row[index])))).map(row => displayValue(row[xIndex])))];
    const option = baseOption(context, true);
    const axisNames = { left: [], right: [] };
    for (const index of yIndices) {
      const side = !stacked && yAxes[index] === 'right' ? 'right' : 'left', name = columns[index].axisName || columns[index].name;
      if (!axisNames[side].includes(name)) axisNames[side].push(name);
    }

    // Keep the axis names below the title/legend band, including dual axes.
    option.grid = { left: 62, right: axisNames.right.length ? 62 : 28, top: context.dashboard ? 68 : 96, bottom: 64, containLabel: true };
    option.xAxis = useTimeAxis
      ? { type: 'time', name: xColumn.name, nameLocation: 'middle', nameGap: 34, ...axisStyle(theme) }
      : useCategoryAxis
        ? {
            type: 'category',
            name: xColumn.name,
            nameLocation: 'middle',
            nameGap: 36,
            data: categories,
            ...axisStyle(theme),
            axisLabel: { hideOverlap: true, color: theme.muted }
          }
        : { type: 'value', name: xColumn.name, scale: true, ...axisStyle(theme, true) };
    option.yAxis = [{
      type: 'value', name: axisNames.left.join(', '), scale: !bars && !stacked, position: 'left', ...axisStyle(theme, true)
    }];
    if (axisNames.right.length) {
      option.yAxis.push({
        type: 'value', name: axisNames.right.join(', '), scale: !bars && !stacked, position: 'right', ...axisStyle(theme)
      });
    }
    option.dataZoom = dataZoom();
    option.series = yIndices.map(yIndex => {
      const seriesType = bars ? 'bar' : ['area', 'stackedArea'].includes(chartType) ? 'line' : chartType;
      const values = bars || stacked ? (() => {
        const totals = new Map(aggregateByCategory(rows, xIndex, yIndex).map(item => [item.name, item.value]));
        return categories.map(category => [category, totals.get(category) ?? null]);
      })() : rows
        .map(row => {
          const category = useCategoryAxis ? displayValue(row[xIndex]) : useTimeAxis ? row[xIndex] : toNumber(row[xIndex]);
          return [category, toNumber(row[yIndex])];
        })
        .filter(pair => pair[0] != null && Number.isFinite(pair[1]) && (useCategoryAxis || useTimeAxis || Number.isFinite(pair[0])));
      return {
        name: columns[yIndex].name,
        type: seriesType,
        yAxisIndex: !stacked && yAxes[yIndex] === 'right' && option.yAxis.length > 1 ? 1 : 0,
        stack: stacked ? 'total' : undefined,
        showSymbol: rows.length <= 500,
        sampling: seriesType === 'line' && rows.length > 2000 ? 'lttb' : undefined,
        progressive: 5000,
        progressiveThreshold: 10000,
        large: (seriesType === 'bar' || seriesType === 'scatter') && rows.length > 5000 && !useCategoryAxis,
        areaStyle: ['area', 'stackedArea'].includes(chartType) ? {} : undefined,
        data: values,
        ...seriesMarks(marks)
      };
    });
    if (marks.visualMap && option.series.length) {
      const [minimum, maximum] = extent(option.series[0].data.map(pair => toNumber(pair[1])).filter(Number.isFinite));
      option.visualMap = {
        type: 'continuous', min: minimum, max: maximum, dimension: 1, seriesIndex: 0,
        right: 8, bottom: 54, calculable: true, textStyle: { color: theme.muted }
      };
    }
    if (horizontal) {
      const category = option.xAxis, measures = option.yAxis;
      option.yAxis = { ...category, inverse: true, nameGap: 28 };
      option.xAxis = measures.map((axis, index) => ({ ...axis, position: index ? 'top' : 'bottom', nameLocation: 'middle', nameGap: index ? 25 : 30 }));
      option.series.forEach(series => {
        series.xAxisIndex = series.yAxisIndex; series.yAxisIndex = 0;
        series.data = series.data.map(([category, value]) => [value, category]);
      });
      option.dataZoom = [{ type: 'inside', yAxisIndex: [0], filterMode: 'none' },
        { type: 'slider', yAxisIndex: [0], width: 14, right: 4, top: context.dashboard ? 68 : 96, bottom: 64, filterMode: 'none' }];
      option.toolbox = toolbox(theme);
      if (option.visualMap) option.visualMap.dimension = 0;
    }
    return option;
  }

  function buildPie(context) {
    const { rows, columns, xIndex, yIndices, theme } = context;
    const yIndex = yIndices[0];
    const option = baseOption(context);
    option.tooltip.trigger = 'item';
      option.tooltip.valueFormatter = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
    option.legend = { type: 'scroll', bottom: 5, textStyle: { color: theme.foreground } };
    option.series = [{
      name: columns[yIndex].name,
      type: 'pie',
      radius: ['25%', '68%'],
      center: ['50%', '50%'],
      minAngle: 1,
      data: aggregateByCategory(rows, xIndex, yIndex).sort((left, right) => right.value - left.value)
    }];
    return option;
  }

  function buildGauge(context) {
    const { rows, columns, yIndices, theme } = context;
    const yIndex = yIndices[0];
    const values = numericValues(rows, yIndex);
    const [minimum, maximum] = extent(values);
    const value = average(values);
    const option = baseOption(context);
    option.tooltip.trigger = 'item';
    option.legend = undefined;
    option.series = [{
      name: columns[yIndex].name,
      type: 'gauge',
      min: minimum,
      max: maximum,
      progress: { show: true, width: 14 },
      axisLine: { lineStyle: { width: 14 } },
      axisLabel: { color: theme.muted },
      detail: { valueAnimation: context.rowCount <= 2000, color: theme.foreground, formatter: '{value}' },
      data: [{ name: 'Average', value: Number.isFinite(value) ? Number(value.toPrecision(8)) : 0 }]
    }];
    return option;
  }

  function buildRadar(context) {
    const { rows, columns, yIndices, theme } = context;
    const metrics = yIndices.map(index => {
      const values = numericValues(rows, index);
      const [, maximum] = extent(values);
      return { index, values, maximum: Math.max(Math.abs(maximum), 1) };
    });
    const option = baseOption(context);
    option.tooltip.trigger = 'item';
    option.radar = {
      center: ['50%', '54%'],
      radius: '64%',
      indicator: metrics.map(metric => ({ name: columns[metric.index].name, max: metric.maximum })),
      axisName: { color: theme.foreground },
      splitLine: { lineStyle: { color: theme.grid } },
      splitArea: { areaStyle: { color: [theme.background, theme.controlBackground] } }
    };
    option.series = [{
      name: 'Average', type: 'radar', data: [{ name: 'Average', value: metrics.map(metric => average(metric.values)) }]
    }];
    return option;
  }

  function buildHeatmap(context) {
    const { rows, columns, xIndex, yIndices, theme } = context;
    const categories = [...new Set(rows.map(row => displayValue(row[xIndex])))];
    const categoryIndex = new Map(categories.map((name, index) => [name, index]));
    const data = [];
    yIndices.forEach((yIndex, seriesIndex) => {
      for (const row of rows) {
        const value = toNumber(row[yIndex]);
        if (Number.isFinite(value)) data.push([categoryIndex.get(displayValue(row[xIndex])), seriesIndex, value]);
      }
    });
    const [minimum, maximum] = extent(data.map(item => item[2]));
    const option = baseOption(context, true);
    option.grid = { left: 90, right: 70, top: 70, bottom: 64, containLabel: true };
    option.xAxis = { type: 'category', name: columns[xIndex].name, data: categories, ...axisStyle(theme) };
    option.yAxis = { type: 'category', data: yIndices.map(index => columns[index].name), ...axisStyle(theme) };
    option.dataZoom = dataZoom();
    option.visualMap = { min: minimum, max: maximum, calculable: true, right: 8, top: 90, textStyle: { color: theme.muted } };
    option.series = [{ name: 'Value', type: 'heatmap', data, progressive: 5000 }];
    return option;
  }

  function buildBoxplot(context) {
    const { rows, columns, yIndices, theme } = context;
    const option = baseOption(context);
    option.grid = { left: 62, right: 28, top: 70, bottom: 48, containLabel: true };
    option.xAxis = { type: 'category', data: yIndices.map(index => columns[index].name), ...axisStyle(theme) };
    option.yAxis = { type: 'value', scale: true, ...axisStyle(theme, true) };
    option.series = [{ name: 'Distribution', type: 'boxplot', data: yIndices.map(index => boxplot(numericValues(rows, index))) }];
    return option;
  }

  function buildTreemap(context) {
    const option = baseOption(context);
    option.tooltip.trigger = 'item';
    option.legend = undefined;
    option.series = [{
      name: 'Value', type: 'treemap', roam: true, nodeClick: 'zoomToNode', breadcrumb: { show: true },
      data: aggregateByCategory(context.rows, context.xIndex, context.yIndices[0]).sort((left, right) => right.value - left.value)
    }];
    return option;
  }

  function buildFunnel(context) {
    const option = baseOption(context);
    option.tooltip.trigger = 'item';
    option.legend = { type: 'scroll', bottom: 5, textStyle: { color: context.theme.foreground } };
    option.series = [{
      name: 'Value', type: 'funnel', left: '12%', top: 72, bottom: 42, width: '76%', sort: 'descending', gap: 2,
      data: aggregateByCategory(context.rows, context.xIndex, context.yIndices[0]).sort((left, right) => right.value - left.value)
    }];
    return option;
  }

  function buildMap(context) {
    const { rows, columns, xIndex, yIndices, theme } = context;
    const map = context.map ? window.DBeaverGeoData.normalize(context.map) : window.DBeaverGeoData.infer({ xColumn: columns[xIndex]?.name, yColumns: yIndices.map(index => columns[index].name) }, columns);
    const result = window.DBeaverGeoData.data(map, columns, rows);
    if (rows.length && !result.points.length) throw new Error('No valid map points. Check the coordinate format, order, WGS84 ranges and numeric value.');
    const data = result.points;
    const valueName = map.value || 'Locations';
    const escape = value => String(value ?? '(null)').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const [minimum, maximum] = extent(data.map(item => item.value[2]));
    const option = baseOption(context);
    option.title.text = `${valueName} by location`;
    option.tooltip = {
      trigger: 'item',
      confine: true,
      backgroundColor: theme.controlBackground,
      borderColor: theme.border,
      textStyle: { color: theme.foreground },
      formatter: params => [escape(params.name), `Longitude: ${params.value[0]}`, `Latitude: ${params.value[1]}`,
        ...(map.value ? [`${escape(map.value)}: ${params.value[2]}`] : []),
        ...(params.data.details || []).map(detail => `${escape(detail.name)}: ${escape(typeof detail.value === 'object' && detail.value !== null ? JSON.stringify(detail.value) : detail.value)}`)].join('<br>')
    };
    option.legend = undefined;
    option.geo = {
      map: 'world',
      roam: true,
      scaleLimit: { min: 1, max: 24 },
      ...(context.dashboard ? { top: 16, bottom: 16 } : {}),
      itemStyle: { areaColor: theme.controlBackground, borderColor: theme.border },
      emphasis: { itemStyle: { areaColor: '#fac858' }, label: { color: theme.foreground } }
    };
    option.visualMap = map.value ? {
      type: 'continuous', min: minimum, max: maximum, dimension: 2,
      right: 8, bottom: 24, calculable: true, textStyle: { color: theme.muted },
      ...(context.dashboard ? { itemHeight: 100, top: 'middle', bottom: undefined } : {})
    } : undefined;
    option.series = [{
      name: valueName,
      type: 'scatter',
      coordinateSystem: 'geo',
      progressive: 5000,
      symbolSize: value => map.value ? Math.max(4, Math.min(24, 4 + 20 * (value[2] - minimum) / Math.max(maximum - minimum, 1))) : 10,
      data
    }];
    return option;
  }

  function buildBaseOption(context) {
    if (context.chartType === 'pie' && context.yIndices.length > 1) context = { ...context, yIndices: context.yIndices.slice(0, 1) };
    if (context.chartType === 'map') return buildMap(context);
    if (context.xIndex < 0 || !context.columns[context.xIndex] || !context.yIndices.length) throw new Error('Choose a category and numeric series.');
    if (CARTESIAN_TYPES.has(context.chartType)) return buildCartesian(context);
    if (context.chartType === 'pie') return buildPie(context);
    if (context.chartType === 'gauge') return buildGauge(context);
    if (context.chartType === 'radar') return buildRadar(context);
    if (context.chartType === 'heatmap') return buildHeatmap(context);
    if (context.chartType === 'boxplot') return buildBoxplot(context);
    if (context.chartType === 'treemap') return buildTreemap(context);
    if (context.chartType === 'funnel') return buildFunnel(context);
    throw new Error(`Unsupported chart type: ${context.chartType}`);
  }

  function normalizeViewport(input) {
    const result = {};
    if (!input || typeof input !== 'object') return result;
    if (Array.isArray(input.dataZoom)) result.dataZoom = input.dataZoom.slice(0, 4).map(item => {
      const view = {};
      if (!item || typeof item !== 'object') return view;
      for (const key of ['start', 'end']) if (typeof item[key] === 'number' && Number.isFinite(item[key])) view[key] = Math.min(100, Math.max(0, item[key]));
      for (const key of ['startValue', 'endValue']) if (typeof item[key] === 'number' && Number.isFinite(item[key])
        || typeof item[key] === 'string' && item[key].length <= 200) view[key] = item[key];
      if (view.start > view.end) [view.start, view.end] = [view.end, view.start];
      return view;
    });
    if (input.geo && typeof input.geo === 'object') {
      const geo = {};
      if (typeof input.geo.zoom === 'number' && Number.isFinite(input.geo.zoom)) geo.zoom = Math.min(128, Math.max(0.1, input.geo.zoom));
      const center = input.geo.center;
      if (Array.isArray(center) && center.length === 2 && center.every(value => typeof value === 'number' && Number.isFinite(value))
        && Math.abs(center[0]) <= 180 && Math.abs(center[1]) <= 90) geo.center = [...center];
      if (Object.keys(geo).length) result.geo = geo;
    }
    return result;
  }
  function viewportOf(chart) {
    const option = chart.getOption();
    return normalizeViewport({ dataZoom: option.dataZoom, geo: option.geo?.[0] });
  }
  function watchViewport(chart, changed) {
    const listener = () => changed(viewportOf(chart));
    chart.on('datazoom', listener); chart.on('georoam', listener);
    chart.on('restore', () => changed({}));
  }
  function buildOption(context) {
    const grouped = groupedContext(context), option = buildBaseOption(grouped), view = normalizeViewport(context.viewport);
    if (grouped !== context && option.title) option.title.text = titleText(context.columns, context.xIndex, context.yIndices)
      + (context.grouping?.seriesColumn ? ` / ${context.grouping.seriesColumn}` : '');
    if (view.dataZoom && Array.isArray(option.dataZoom)) option.dataZoom.forEach((zoom, index) => Object.assign(zoom, view.dataZoom[index] || view.dataZoom[0] || {}));
    if (view.geo && option.geo) Object.assign(option.geo, view.geo);
    if (Array.isArray(context.colors) && context.colors.length) option.color = context.colors;
    if (option.legend) option.legend.show = context.legend !== false;
    return option;
  }

  const hasRenderableData = option => Array.isArray(option?.series)
    && option.series.some(series => Array.isArray(series.data) && series.data.length > 0);

  function chartTitle(config) {
    if (config.chartType === 'map' && config.map) return `${config.map.value || 'Locations'} by ${config.map.label || 'location'}`.slice(0, 200);
    const names = (config.chartType === 'pie' ? (config.yColumns || []).slice(0, 1) : (config.yColumns || [])).join(', ');
    return (names ? `${names}${config.xColumn && config.chartType !== 'gauge' ? ` by ${config.xColumn}` : ''}${config.grouping?.seriesColumn ? ` / ${config.grouping.seriesColumn}` : ''}` : 'Chart').slice(0, 200);
  }
  window.DBeaverEChartsAnalytics = Object.freeze({ buildOption, chartTitle, displayValue, hasRenderableData, toNumber, CHART_TYPES, populateTypes,
    normalizeViewport, viewportOf, watchViewport, normalizeGrouping, groupedContext, canGroup, canSplitGroup: type => CARTESIAN_TYPES.has(type) });
  if (typeof document !== 'undefined') {
    const select = document.getElementById('chartType'); if (select) populateTypes(select);
  }
})();
