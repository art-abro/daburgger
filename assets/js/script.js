window.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded and script is running.");

  let burgers = [];
  let sortState = { field: null, dir: 'desc' }; // dir: 'asc' | 'desc'

  document.getElementById("location-filter").addEventListener("change", applyFilters);
  document.getElementById("type-filter").addEventListener("change", applyFilters);
  document.getElementById("sort-rating").addEventListener("click", () => sortTable("rating"));
  document.getElementById("sort-location").addEventListener("click", () => sortTable("location"));
  document.getElementById("sort-restaurant").addEventListener("click", () => sortTable("restaurant"));
  document.getElementById("sort-date").addEventListener("click", () => sortTable("date"));

  // Fech burgers from API
  const apiUrl = "https://enqh5c880l.execute-api.eu-west-3.amazonaws.com/burgers"; // My API endpoint

  function normalize(data) {
    if (data && typeof data === 'object' && 'body' in data) {
      try { return JSON.parse(data.body || '[]'); } catch { return []; }
    }
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch { return []; }
    }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }

  fetch(apiUrl)
    .then(res => res.text())
    .then(text => {
      let raw; try { raw = JSON.parse(text); } catch { raw = text; }
      burgers = normalize(raw).map(b => ({ ...b, rating: Number(b.rating) }));
      populateFilters();
      renderTable(burgers);
    })
    .catch(err => {
      console.error("Failed to load burgers:", err);
      populateFilters(); // attach listeners anyway so UI still works (on empty data)
    });

  // Function to populate filters
  function populateFilters() {
    const locationFilter = document.getElementById("location-filter");
    const locationSet = new Set(burgers.map(b => b.location).filter(Boolean));
    locationFilter.innerHTML = '<option value="">All</option>';
    locationSet.forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc; opt.textContent = loc;
      locationFilter.appendChild(opt);
    });
  }

  // Apply filters to burger list
  function applyFilters() {
    const loc = document.getElementById("location-filter").value;
    const type = document.getElementById("type-filter").value;

    let filtered = [...burgers];
    if (loc) filtered = filtered.filter(b => b.location === loc);
    if (type) filtered = filtered.filter(b => b.burgerType?.toLowerCase() === type.toLowerCase());

    renderTable(filtered);
  }

  // Sort table by rating, restaurant or date
  function sortTable(field) {
    if (sortState.field === field) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.field = field;
      // sensible defaults
      sortState.dir = (field === 'rating' || field === 'date') ? 'desc' : 'asc';
    }

    // active states (optional)
    ["rating","location","restaurant","date"].forEach(f => {
      const btn = document.getElementById(`sort-${f}`);
      if (btn) btn.classList.toggle("active", field === f);
    });

    const loc  = document.getElementById("location-filter").value;
    const type = document.getElementById("type-filter").value;

    let data = [...burgers];
    if (loc)  data = data.filter(b => b.location === loc);
    if (type) data = data.filter(b => (b.burgerType || '').toLowerCase() === type.toLowerCase());

    data.sort((a, b) => {
      let cmp = 0;
      if (field === "rating") {
        cmp = (a.rating || 0) - (b.rating || 0);
      } else if (field === "location") {
        cmp = (a.location || '').localeCompare(b.location || '');
      } else if (field === "restaurant") {
        cmp = (a.restaurant || '').localeCompare(b.restaurant || '');
      } else if (field === "date") {
        const ta = Date.parse(a.date || '') || 0;
        const tb = Date.parse(b.date || '') || 0;
        cmp = ta - tb; // asc = oldest→newest
      }
      return sortState.dir === 'asc' ? cmp : -cmp;
    });

    renderTable(data);
  }

  // Render the burger table
  function renderTable(data) {
    const tbody = document.querySelector("#burger-table tbody");
    tbody.innerHTML = "";

    data.forEach(b => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${b.restaurant}</td>
        <td>${b.location}</td>
        <td>${b.burgerName}</td>
        <td>${b.burgerType || ""}</td>
        <td>${b.rating}</td>
        <td>${b.date}</td>
        <td><a href="${b.instagram}" target="_blank" title="View on Instagram">📸</a></td>
        <td><a href="${b.maps}" target="_blank" title="View on Google Maps">📍</a></td>
      `;
      tbody.appendChild(row);
    });
  }


});