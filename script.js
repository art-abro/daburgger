let burgers = [];
let currentSort = null;

fetch("burgers.json")
  .then(res => res.json())
  .then(data => {
    burgers = data;
    populateFilters();
    renderTable(burgers);
  });

function populateFilters() {
  const locationSet = new Set(burgers.map(b => b.location));
  const locationFilter = document.getElementById("location-filter");

  locationSet.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    locationFilter.appendChild(opt);
  });

  document.getElementById("location-filter").addEventListener("change", applyFilters);
  document.getElementById("type-filter").addEventListener("change", applyFilters);
  document.getElementById("sort-rating").addEventListener("click", () => sortTable("rating"));
  document.getElementById("sort-location").addEventListener("click", () => sortTable("location"));
}

function applyFilters() {
  const loc = document.getElementById("location-filter").value;
  const type = document.getElementById("type-filter").value;

  let filtered = [...burgers];
  if (loc) filtered = filtered.filter(b => b.location === loc);
  if (type) filtered = filtered.filter(b => b.burgerType?.toLowerCase() === type.toLowerCase());

  renderTable(filtered);
}

function sortTable(field) {
  const button = field === "rating" ? document.getElementById("sort-rating") : document.getElementById("sort-location");

  const isSameSort = currentSort === field;
  currentSort = isSameSort ? null : field;

  document.getElementById("sort-rating").classList.remove("active");
  document.getElementById("sort-location").classList.remove("active");
  if (!isSameSort) button.classList.add("active");

  let data = [...burgers];

  if (!isSameSort) {
    data.sort((a, b) => {
      if (field === "rating") return b.rating - a.rating;
      return a.location.localeCompare(b.location);
    });
  }

  renderTable(data);
}

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