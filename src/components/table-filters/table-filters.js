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
    const activeFilters = new Map();
    let currentSort = { columnIndex: null, direction: null };

    const getCellText = (row, columnIndex) =>
      row.cells[columnIndex]?.textContent?.trim() ?? '';

    const compareValues = (valueA, valueB) => {
      const numberA = Number(valueA.replace(',', '.'));
      const numberB = Number(valueB.replace(',', '.'));
      const bothNumeric = !Number.isNaN(numberA) && !Number.isNaN(numberB);

      if (bothNumeric) {
        return numberA - numberB;
      }

      return valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' });
    };

    const updateHeaderIndicators = () => {
      Array.from(headerRow.cells).forEach((cell, index) => {
        const baseLabel = cell.dataset.baseLabel ?? cell.textContent.trim();
        cell.dataset.baseLabel = baseLabel;

        const sortArrow = currentSort.columnIndex === index
          ? currentSort.direction === 'asc'
            ? ' ↑'
            : currentSort.direction === 'desc'
              ? ' ↓'
              : ''
          : '';

        const hasFilter = activeFilters.has(index);
        const filterMarker = hasFilter ? ' •' : '';

        cell.textContent = `${baseLabel}${sortArrow}${filterMarker}`;
      });
    };

    const applyFiltersAndSort = () => {
      const filteredRows = tableRows.filter((row) => {
        for (const [columnIndex, filterValue] of activeFilters.entries()) {
          const rowValue = getCellText(row, columnIndex).toLowerCase();
          if (!rowValue.includes(filterValue)) {
            return false;
          }
        }
        return true;
      });

      let rowsToDisplay = filteredRows;
      if (currentSort.columnIndex !== null && currentSort.direction) {
        const directionFactor = currentSort.direction === 'asc' ? 1 : -1;
        rowsToDisplay = [...filteredRows].sort((rowA, rowB) => {
          const valueA = getCellText(rowA, currentSort.columnIndex);
          const valueB = getCellText(rowB, currentSort.columnIndex);
          return compareValues(valueA, valueB) * directionFactor;
        });
      }

      tbody.innerHTML = '';

      if (rowsToDisplay.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="${headerRow.cells.length}" class="text-secondary">No matching rows found.</td>`;
        tbody.appendChild(emptyRow);
      } else {
        rowsToDisplay.forEach((row) => tbody.appendChild(row));
      }

      updateHeaderIndicators();
    };

    Array.from(headerRow.cells).forEach((headerCell, columnIndex) => {
      const label = headerCell.textContent.trim().toLowerCase();
      const hasCheckbox = Boolean(headerCell.querySelector('input[type="checkbox"]'));

      if (hasCheckbox || skipSet.has(label) || label === '') {
        return;
      }

      headerCell.style.cursor = 'pointer';
      headerCell.title = 'Click: sort | Shift+Click: filter';

      headerCell.addEventListener('click', (event) => {
        if (event.shiftKey) {
          const baseLabel = headerCell.dataset.baseLabel ?? headerCell.textContent.trim();
          const existing = activeFilters.get(columnIndex) ?? '';
          const value = window.prompt(`Filter by ${baseLabel} (leave empty to clear):`, existing) ?? existing;
          const normalized = value.trim().toLowerCase();

          if (normalized) {
            activeFilters.set(columnIndex, normalized);
          } else {
            activeFilters.delete(columnIndex);
          }

          applyFiltersAndSort();
          return;
        }

        if (currentSort.columnIndex !== columnIndex) {
          currentSort = { columnIndex, direction: 'asc' };
        } else if (currentSort.direction === 'asc') {
          currentSort = { columnIndex, direction: 'desc' };
        } else {
          currentSort = { columnIndex: null, direction: null };
        }

        applyFiltersAndSort();
      });
    });

    updateHeaderIndicators();

    table.dataset.filtersEnabled = 'true';
  });
};
