export const enableTableColumnFilters = (root, options = {}) => {
  const {
    tableSelector = 'table',
    skipColumns = ['actions']
  } = options;

  const skipSet = new Set(skipColumns.map((value) => String(value).trim().toLowerCase()));

  root.querySelectorAll(tableSelector).forEach((table) => {
    if (table.dataset.filtersEnabled === 'true') {
      return;
    }

    const thead = table.tHead;
    const tbody = table.tBodies?.[0];

    if (!thead || !tbody || thead.rows.length === 0) {
      return;
    }

    const headerRow = thead.rows[0];
    const tableRows = Array.from(tbody.rows);
    const getBottomPinnedRows = () => tableRows.filter((row) => row.dataset.sortFixedBottom === 'true');
    const getSortableRows = () => tableRows.filter((row) => row.dataset.sortFixedBottom !== 'true');
    let currentSort = { columnIndex: null, direction: null };

    const MONTH_INDEX_BY_NAME = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12
    };

    const getCellText = (row, columnIndex) =>
      row.cells[columnIndex]?.textContent?.trim() ?? '';

    const parseMonthPeriod = (value) => {
      const match = String(value).trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
      if (!match) {
        return null;
      }

      const month = MONTH_INDEX_BY_NAME[match[1].toLowerCase()];
      const year = Number(match[2]);

      if (!month || Number.isNaN(year)) {
        return null;
      }

      return year * 100 + month;
    };

    const parseLocalizedDateTime = (value) => {
      const match = String(value)
        .trim()
        .match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*г\.)?(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i);

      if (!match) {
        return null;
      }

      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const hours = Number(match[4] ?? 0);
      const minutes = Number(match[5] ?? 0);
      const seconds = Number(match[6] ?? 0);

      const timestamp = new Date(year, month - 1, day, hours, minutes, seconds).getTime();
      return Number.isNaN(timestamp) ? null : timestamp;
    };

    const parseNumberLike = (value) => {
      const raw = String(value).trim();
      if (!/[\d]/.test(raw)) {
        return null;
      }

      let normalized = raw
        .replace(/\s|\u00A0/g, '')
        .replace(/[^\d,.-]/g, '');

      if (!normalized || normalized === '-' || normalized === ',' || normalized === '.') {
        return null;
      }

      const hasComma = normalized.includes(',');
      const hasDot = normalized.includes('.');

      if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(',');
        const lastDot = normalized.lastIndexOf('.');
        const decimalSeparator = lastComma > lastDot ? ',' : '.';

        if (decimalSeparator === ',') {
          normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
          normalized = normalized.replace(/,/g, '');
        }
      } else if (hasComma) {
        normalized = normalized.replace(',', '.');
      }

      const parsed = Number(normalized);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const toComparableValue = (value) => {
      const text = String(value ?? '').trim();
      if (!text) {
        return { type: 'empty', value: '' };
      }

      const parsedDate = parseLocalizedDateTime(text);
      if (parsedDate !== null) {
        return { type: 'date', value: parsedDate };
      }

      const parsedPeriod = parseMonthPeriod(text);
      if (parsedPeriod !== null) {
        return { type: 'period', value: parsedPeriod };
      }

      const parsedNumber = parseNumberLike(text);
      if (parsedNumber !== null) {
        return { type: 'number', value: parsedNumber };
      }

      return { type: 'text', value: text.toLocaleLowerCase() };
    };

    const compareValues = (valueA, valueB) => {
      const comparableA = toComparableValue(valueA);
      const comparableB = toComparableValue(valueB);

      if (comparableA.type === 'empty' && comparableB.type !== 'empty') {
        return 1;
      }

      if (comparableB.type === 'empty' && comparableA.type !== 'empty') {
        return -1;
      }

      if (comparableA.type === comparableB.type) {
        if (comparableA.type === 'text') {
          return comparableA.value.localeCompare(comparableB.value, undefined, {
            numeric: true,
            sensitivity: 'base'
          });
        }

        return comparableA.value - comparableB.value;
      }

      const fallbackNumberA = parseNumberLike(valueA);
      const fallbackNumberB = parseNumberLike(valueB);
      if (fallbackNumberA !== null && fallbackNumberB !== null) {
        return fallbackNumberA - fallbackNumberB;
      }

      const fallbackTextA = String(valueA ?? '').trim();
      const fallbackTextB = String(valueB ?? '').trim();

      return fallbackTextA.localeCompare(fallbackTextB, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    };

    const updateHeaderIndicators = () => {
      Array.from(headerRow.cells).forEach((cell, index) => {
        const hasCheckbox = Boolean(cell.querySelector('input[type="checkbox"]'));
        if (hasCheckbox) {
          return;
        }

        const baseLabel = cell.dataset.baseLabel ?? cell.textContent.trim();
        cell.dataset.baseLabel = baseLabel;

        const sortArrow = currentSort.columnIndex === index
          ? currentSort.direction === 'asc'
            ? ' ↑'
            : currentSort.direction === 'desc'
              ? ' ↓'
              : ''
          : '';

        cell.textContent = `${baseLabel}${sortArrow}`;
      });
    };

    const applySort = () => {
      const sortableRows = getSortableRows();
      const bottomPinnedRows = getBottomPinnedRows();
      let rowsToDisplay = sortableRows;
      if (currentSort.columnIndex !== null && currentSort.direction) {
        const directionFactor = currentSort.direction === 'asc' ? 1 : -1;
        rowsToDisplay = [...sortableRows].sort((rowA, rowB) => {
          const valueA = getCellText(rowA, currentSort.columnIndex);
          const valueB = getCellText(rowB, currentSort.columnIndex);
          return compareValues(valueA, valueB) * directionFactor;
        });
      }

      tbody.innerHTML = '';

      rowsToDisplay.forEach((row) => tbody.appendChild(row));
      bottomPinnedRows.forEach((row) => tbody.appendChild(row));

      updateHeaderIndicators();
    };

    Array.from(headerRow.cells).forEach((headerCell, columnIndex) => {
      const label = headerCell.textContent.trim().toLowerCase();
      const hasCheckbox = Boolean(headerCell.querySelector('input[type="checkbox"]'));

      if (hasCheckbox || skipSet.has(label) || label === '') {
        return;
      }

      headerCell.style.cursor = 'pointer';
      headerCell.title = 'Click: sort';

      headerCell.addEventListener('click', () => {
        if (currentSort.columnIndex !== columnIndex) {
          currentSort = { columnIndex, direction: 'asc' };
        } else if (currentSort.direction === 'asc') {
          currentSort = { columnIndex, direction: 'desc' };
        } else {
          currentSort = { columnIndex: null, direction: null };
        }

        applySort();
      });
    });

    updateHeaderIndicators();

    table.dataset.filtersEnabled = 'true';
  });
};
